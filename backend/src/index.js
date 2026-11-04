const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const morgan = require("morgan");
const routesApi = require("./routes/index.route")
const { initSocket } = require("./utils/socket");
const http = require("http");
const path = require("path");
const { connectDB } = require("./config/database");
dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));


// API Routes
routesApi(app);

const server = http.createServer(app);
initSocket(server);

const start = async ({ port = PORT, uri = process.env.MONGODB_URI } = {}) => {
  await connectDB(uri);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  console.log(`Backend running at http://localhost:${server.address().port}`);
  return server;
};

if (require.main === module) {
  start().catch(() => {
    // Never print credentials from a driver error/connection URI.
    console.error('Backend startup failed. Check MONGODB_URI, replica set and database indexes.');
    process.exitCode = 1;
    require('mongoose').disconnect();
  });
}

module.exports = { app, server, start };
