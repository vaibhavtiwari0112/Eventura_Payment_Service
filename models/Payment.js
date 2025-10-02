const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: false, index: true },
    orderId: { type: String, required: true, index: true },
    paymentId: { type: String },
    amount: { type: Number, required: true }, // in paise (smallest currency unit)
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["created", "authorized", "captured", "failed", "refunded"],
      default: "created",
    },
    method: { type: String },
    receipt: { type: String },
    notes: { type: Object },
    raw: { type: Object }, // store raw response from RZP
    signatureVerified: { type: Boolean, default: false },
    gatewayResponse: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", PaymentSchema);
