// require("dotenv").config();
// const express = require("express");
// const mongoose = require("mongoose");
// const morgan = require("morgan");
// const cors = require("cors");

// const paymentRoutes = require("./routes/payments");

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.use(morgan("tiny"));

// app.use("/api/payments", paymentRoutes);
// app.use("/", (req, res) => res.status(200).json({ message: "Home Page" }));

// const PORT = process.env.PORT || 4000;
// const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/eventura";

// mongoose
//   .connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => {
//     console.log("MongoDB connected");
//     app.listen(PORT, () => console.log("Payment service running on", PORT));
//   })
//   .catch((err) => {
//     console.error("Mongo connection error:", err);
//   });
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const cors = require("cors");

const paymentRoutes = require("./routes/payments");

const app = express();

// ✅ Allowed origins (no trailing slash!)
const allowedOrigins = [
  "http://localhost:3000",
  "https://eventura-frontend-orcin.vercel.app",
];

// ✅ CORS setup
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow curl / postman
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn("❌ CORS blocked request from:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ✅ Preflight handled by cors()
app.options("*", cors());

// 🔍 Log every request
app.use((req, res, next) => {
  console.log(
    "➡️ Incoming request:",
    req.method,
    req.url,
    "from:",
    req.headers.origin
  );
  next();
});

// Middleware
app.use(express.json());
app.use(morgan("tiny"));

// Routes
app.use("/api/payments", paymentRoutes);
app.use("/", (req, res) => res.status(200).json({ message: "Home Page" }));

// DB
const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/eventura";
mongoose
  .connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ Mongo connection error:", err));

module.exports = app; // ✅ Export for Vercel
