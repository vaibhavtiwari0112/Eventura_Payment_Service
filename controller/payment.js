const crypto = require("crypto");
const Payment = require("../models/Payment");
const razor = require("../service/razorpayService");
const axios = require("axios");

// ─── Create Razorpay Order ────────────────────────────────────────────────────

exports.createOrder = async (req, res) => {
  try {
    const { amount, receipt, notes = {} } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "amount required" });
    }

    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: receipt || `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes,
    };

    const order = await razor.orders.create(options);

    const paymentDoc = await Payment.create({
      bookingId: null,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: "created",
      receipt: order.receipt,
      notes: order.notes,
      raw: order,
    });

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      paymentId: paymentDoc._id,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("create-order error", err);
    res
      .status(500)
      .json({ error: "order creation failed", details: err.message });
  }
};

// ─── Verify Razorpay Payment ──────────────────────────────────────────────────

exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentDocId,
      bookingId,
      hallId,
    } = req.body;

    // ✅ Validate all required fields upfront with clear error messages
    const missingFields = [];
    if (!razorpay_order_id) missingFields.push("razorpay_order_id");
    if (!razorpay_payment_id) missingFields.push("razorpay_payment_id");
    if (!razorpay_signature) missingFields.push("razorpay_signature");

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "missing required fields",
        missing: missingFields,
      });
    }

    // ✅ Verify Razorpay signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const signatureVerified = generated_signature === razorpay_signature;

    // ✅ Find or create Payment document
    let payment = null;
    if (paymentDocId) {
      payment = await Payment.findById(paymentDocId);
    } else if (bookingId) {
      payment = await Payment.findOne({
        bookingId,
        orderId: razorpay_order_id,
      });
    } else {
      payment = await Payment.findOne({ orderId: razorpay_order_id });
    }

    if (!payment) {
      payment = await Payment.create({
        bookingId: bookingId || null,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: 0,
        status: signatureVerified ? "captured" : "failed",
        signatureVerified,
      });
    }

    payment.paymentId = razorpay_payment_id;
    payment.signatureVerified = signatureVerified;
    payment.status = signatureVerified ? "captured" : "failed";
    payment.gatewayResponse = { razorpay_signature };

    // ✅ Store hallId on the payment document so we don't lose it
    if (hallId) payment.hallId = hallId;
    if (bookingId) payment.bookingId = bookingId;

    await payment.save();
    console.log(
      "Payment saved | status:",
      payment.status,
      "| bookingId:",
      payment.bookingId,
    );

    // ✅ Notify booking service only when signature is verified
    if (signatureVerified) {
      const finalBookingId = bookingId || payment?.bookingId;
      const finalHallId = hallId || payment?.hallId;

      if (!finalBookingId) {
        console.warn(
          "⚠️ Payment verified but no bookingId — cannot confirm booking",
        );
      } else if (!finalHallId) {
        // ✅ FIX: hallId missing is a common cause of 400 — log it clearly
        console.error(
          "❌ Cannot notify booking service — hallId is missing from request body",
        );
        console.error(
          "   bookingId:",
          finalBookingId,
          "| hallId received:",
          hallId,
        );
      } else {
        await notifyBookingService({
          bookingId: finalBookingId,
          hallId: finalHallId,
          authHeader: req.headers["authorization"],
        });
      }
    }

    res.json({ success: true, signatureVerified, paymentId: payment._id });
  } catch (err) {
    console.error("verify error", err);
    res
      .status(500)
      .json({ error: "verification failed", details: err.message });
  }
};

// ─── Helper: Notify Booking Service ──────────────────────────────────────────

async function notifyBookingService({ bookingId, hallId, authHeader }) {
  const bookingServiceUrl = process.env.BOOKING_SERVICE_URL;

  if (!bookingServiceUrl) {
    console.error("❌ BOOKING_SERVICE_URL env var is not set");
    return;
  }

  // ✅ FIX: Validate UUID format before calling — prevents "undefined" or
  //         malformed values reaching Spring Boot which causes 400
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!UUID_REGEX.test(bookingId)) {
    console.error("❌ bookingId is not a valid UUID:", bookingId);
    return;
  }
  if (!UUID_REGEX.test(hallId)) {
    console.error("❌ hallId is not a valid UUID:", hallId);
    return;
  }

  // ✅ FIX: Build URL explicitly — avoids "?hallId=undefined" edge case
  const url = `${bookingServiceUrl}/bookings/${bookingId}/payment-success?hallId=${hallId}`;
  console.log("📌 Notifying booking service | url:", url);

  try {
    const headers = {
      "Content-Type": "application/json",
    };

    // ✅ FIX: Forward auth header only if it exists and is valid
    //    If your booking service goes through the API gateway, the JWT must be present
    //    If it calls the booking service directly (internal), you may not need auth
    if (authHeader && authHeader.startsWith("Bearer ")) {
      headers["Authorization"] = authHeader;
    } else {
      console.warn(
        "⚠️ No valid Authorization header to forward — booking service may reject (401/403)",
      );
      // If booking service is behind gateway, add an internal service token here:
      // headers["Authorization"] = `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`;
    }

    const response = await axios.post(
      url,
      {},
      {
        headers,
        timeout: 15000, // ✅ 15s timeout — Render cold starts can take 10-30s
      },
    );

    console.log(
      "✅ Booking service confirmed | status:",
      response.status,
      "| bookingId:",
      bookingId,
    );
  } catch (err) {
    if (err.response) {
      // ✅ Log the full response body — this tells you exactly why Spring returned 400
      console.error("❌ Booking service returned error");
      console.error("   HTTP status :", err.response.status);
      console.error("   Response body:", JSON.stringify(err.response.data));
      console.error("   URL called   :", url);
      console.error("   bookingId    :", bookingId);
      console.error("   hallId       :", hallId);
    } else if (err.code === "ECONNREFUSED") {
      console.error(
        "❌ Booking service is unreachable (connection refused) | url:",
        url,
      );
    } else if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
      console.error(
        "❌ Booking service timed out — Render cold start? | url:",
        url,
      );
    } else {
      console.error("❌ Booking service call failed:", err.message);
    }
  }
}
