const crypto = require("crypto");
const Payment = require("../models/Payment");
const razor = require("../service/razorpayService");
const axios = require("axios");

// Create Razorpay order
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
      bookingId: null, // booking will be linked later
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

// Verify Razorpay payment
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

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "missing fields" });
    }

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    const signatureVerified = generated_signature === razorpay_signature;

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
    await payment.save();

    console.log("payment status:", payment.status);

    // 🔔 If verified, notify Booking Service to mark payment success
    if (signatureVerified && (bookingId || payment?.bookingId) && hallId) {
      const finalBookingId = bookingId || payment?.bookingId;
      console.log(
        "📌 Notifying booking service with bookingId:",
        finalBookingId
      );

      try {
        await axios.post(
          `${process.env.BOOKING_SERVICE_URL}/bookings/${finalBookingId}/payment-success?hallId=${hallId}`,
          {},
          {
            headers: {
              Authorization: req.headers["authorization"], // forward user token
            },
          }
        );
      } catch (err) {
        console.error("❌ Failed to notify booking service", err.message);
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
