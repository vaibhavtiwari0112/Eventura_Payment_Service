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

// ✅ Configure CORS properly
const allowedOrigins = [
  "https://eventura-frontend-orcin.vercel.app",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("tiny"));

// ✅ Routes
app.use("/api/payments", paymentRoutes);
app.get("/", (req, res) =>
  res.status(200).json({ message: "Payment Service Active 🚀" })
);

// ✅ MongoDB connection
const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/eventura";

mongoose
  .connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ MongoDB connected");
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () =>
      console.log(`🚀 Payment Service running on ${PORT}`)
    );
  })
  .catch((err) => console.error("❌ Mongo connection error:", err));
