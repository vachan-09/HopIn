// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ===== Store data =====
let drivers = {};      // { socketId: { lat, lng, status, number } }
let students = {};     // { socketId: { lat, lng, requesting, expiry } }
let studentsTimeouts = {}; // { socketId: timeoutId }
let rickshawCounter = 1;

// Helper: list of currently requesting students (for easy emission)
function getRequestingStudentsArray() {
  return Object.entries(students)
    .filter(([id, s]) => s.requesting)
    .map(([id, s]) => ({ id, lat: s.lat, lng: s.lng, expiry: s.expiry || null }));
}

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // When a driver sends their location we treat them as a driver and immediately send them existing requests
  socket.on("driverLocation", (data) => {
    // assign number if new driver
    if (!drivers[socket.id]) {
      drivers[socket.id] = {
        number: rickshawCounter++,
        lat: data.lat,
        lng: data.lng,
        status: data.status,
      };
      socket.emit("assignRickshawNumber", drivers[socket.id].number);
    } else {
      Object.assign(drivers[socket.id], data);
    }

    // Emit driversUpdate to everyone (so drivers see each other)
    io.emit("driversUpdate", drivers);

    // Send currently requesting students to this driver immediately
    const reqs = getRequestingStudentsArray();
    if (reqs.length) {
      socket.emit("existingRequests", reqs);
    }
  });

  socket.on("statusUpdate", ({ status }) => {
    if (drivers[socket.id]) {
      drivers[socket.id].status = status;
      io.emit("driversUpdate", drivers);
    }
  });

  // Student shares live location (always called by watchPosition)
  socket.on("studentLocation", (data) => {
    if (!students[socket.id]) {
      students[socket.id] = { lat: data.lat, lng: data.lng, requesting: false };
    } else {
      students[socket.id].lat = data.lat;
      students[socket.id].lng = data.lng;
    }
    // Broadcast students update so everyone (drivers and students) sees current requesting students & locations
    io.emit("studentsUpdate", getRequestingStudentsArray());
  });

  // Student starts a ride request
  socket.on("startRequest", (loc) => {
    // Clear previous timeout if any
    if (studentsTimeouts[socket.id]) {
      clearTimeout(studentsTimeouts[socket.id]);
      delete studentsTimeouts[socket.id];
    }

    if (!students[socket.id]) students[socket.id] = { ...loc, requesting: true };
    else Object.assign(students[socket.id], loc, { requesting: true });

    // Set expiry timestamp
    const expiry = Date.now() + 5 * 60 * 1000;
    students[socket.id].expiry = expiry;

    // Server-side auto-cancel after 5 minutes
    studentsTimeouts[socket.id] = setTimeout(() => {
      if (students[socket.id]) {
        students[socket.id].requesting = false;
        delete students[socket.id].expiry;
      }
      delete studentsTimeouts[socket.id];
      io.emit("studentStopRequest", socket.id);
      io.emit("studentsUpdate", getRequestingStudentsArray());
    }, 5 * 60 * 1000);

    // Notify all drivers (and all clients) about this request
    io.emit("studentRequest", { id: socket.id, lat: loc.lat, lng: loc.lng, expiry });
    io.emit("studentsUpdate", getRequestingStudentsArray());
  });

  // Student cancels a request
  socket.on("stopRequest", () => {
    if (studentsTimeouts[socket.id]) {
      clearTimeout(studentsTimeouts[socket.id]);
      delete studentsTimeouts[socket.id];
    }
    if (students[socket.id]) {
      students[socket.id].requesting = false;
      delete students[socket.id].expiry;
    }
    io.emit("studentStopRequest", socket.id);
    io.emit("studentsUpdate", getRequestingStudentsArray());
  });

  // When someone disconnects, clean up
  socket.on("disconnect", () => {
    if (drivers[socket.id]) {
      delete drivers[socket.id];
      io.emit("driversUpdate", drivers);
    }

    if (studentsTimeouts[socket.id]) {
      clearTimeout(studentsTimeouts[socket.id]);
      delete studentsTimeouts[socket.id];
    }
    if (students[socket.id]) {
      // if they were requesting, notify drivers to remove marker
      if (students[socket.id].requesting) {
        io.emit("studentStopRequest", socket.id);
      }
      delete students[socket.id];
      io.emit("studentsUpdate", getRequestingStudentsArray());
    }

    console.log("Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
