// public/driver.js (complete, paste over)
const socket = io();

let map;
let myMarker = null;
let myLocation = null;
let myStatus = "active"; // "active" or "break"
let myRickshawNumber = null;

let studentMarkers = {}; // { id: L.marker }
let driverMarkers = {};  // { id: L.marker }

// --- DivIcons (emojis) ---
const activeDriverIcon = (size = 35) =>
  L.divIcon({ className: "driver-emoji active", html: `<div style="font-size:${size}px;">🚘</div>` });

const breakDriverIcon = (size = 35) =>
  L.divIcon({ className: "driver-emoji break", html: `<div style="font-size:${size}px;">🚖</div>` });

const studentIcon = (glow = false) =>
  L.divIcon({
    className: "student-emoji" + (glow ? " glow" : ""),
    html: `<div style="font-size:30px;">🧍🏻‍♂️</div>`,
  });

function initMap() {
  const defaultCenter = [20.5937, 78.9629];
  map = L.map("map").setView(defaultCenter, 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        myLocation = { lat: latitude, lng: longitude };

        const icon = myStatus === "break" ? breakDriverIcon() : activeDriverIcon();

        if (!myMarker) {
          myMarker = L.marker([latitude, longitude], { icon })
            .addTo(map)
            .bindTooltip("You (Driver)", { direction: "top" });
          map.setView([latitude, longitude], 17);
        } else {
          myMarker.setLatLng([latitude, longitude]);
          myMarker.setIcon(icon);
        }

        // Send live location + status to server
        socket.emit("driverLocation", { lat: latitude, lng: longitude, status: myStatus });
      },
      (err) => {
        console.error("Geolocation error:", err);
        alert("Please enable location access for driver.");
      },
      { enableHighAccuracy: true }
    );
  } else {
    alert("Geolocation not supported.");
  }
}

// --- Receive assigned rickshaw number from server ---
socket.on("assignRickshawNumber", (num) => {
  myRickshawNumber = num;
  const header = document.getElementById("rickshawNumber");
  if (header) header.textContent = `Rickshaw #${String(num).padStart(3, "0")}`;
});

// --- Break toggle (UI) ---
const breakBtn = document.getElementById("breakBtn");
// optional "resume" button if you have one; if not we toggle the text
if (breakBtn) {
  breakBtn.addEventListener("click", () => {
    myStatus = myStatus === "active" ? "break" : "active";
    // send correct event name expected by server:
    socket.emit("statusUpdate", { status: myStatus });
    // update own marker immediately
    if (myMarker) {
      const icon = myStatus === "break" ? breakDriverIcon() : activeDriverIcon();
      myMarker.setIcon(icon);
    }
    // update button label
    breakBtn.textContent = myStatus === "break" ? "Resume" : "Take Break";
  });
}

// --- driversUpdate: show other drivers (emoji markers) ---
socket.on("driversUpdate", (drivers) => {
  for (let id in drivers) {
    const d = drivers[id];
    if (id === socket.id) continue;

    const icon = d.status === "break" ? breakDriverIcon() : activeDriverIcon();

    if (!driverMarkers[id]) {
      driverMarkers[id] = L.marker([d.lat, d.lng], { icon })
        .addTo(map)
        .bindTooltip(`Rickshaw #${String(d.number).padStart(3, "0")} - ${d.status === "break" ? "At Break" : "Active"}`, { direction: "top" });
    } else {
      driverMarkers[id].setLatLng([d.lat, d.lng]);
      driverMarkers[id].setIcon(icon);
      // update tooltip text (in case number/status changed)
      driverMarkers[id].bindTooltip(`Rickshaw #${String(d.number).padStart(3, "0")} - ${d.status === "break" ? "At Break" : "Active"}`, { direction: "top" });
    }
  }

  // remove markers for drivers that disappeared
  for (let id in driverMarkers) {
    if (!drivers[id]) {
      map.removeLayer(driverMarkers[id]);
      delete driverMarkers[id];
    }
  }
});

// --- When driver connects, server may send existing student requests ---
socket.on("existingRequests", (arr) => {
  // arr could be array of { id, lat, lng, expiry }
  arr.forEach((s) => {
    if (!studentMarkers[s.id]) {
      studentMarkers[s.id] = L.marker([s.lat, s.lng], { icon: studentIcon(false) })
        .addTo(map)
        .bindTooltip("Student requesting ride", { direction: "top" });
    } else {
      studentMarkers[s.id].setLatLng([s.lat, s.lng]);
    }
  });
});

// --- New live studentRequest arrives ---
socket.on("studentRequest", (data) => {
  // data: { id, lat, lng, expiry }
  if (!studentMarkers[data.id]) {
    studentMarkers[data.id] = L.marker([data.lat, data.lng], { icon: studentIcon(true) })
      .addTo(map)
      .bindTooltip("Student requesting ride", { direction: "top" });
  } else {
    studentMarkers[data.id].setLatLng([data.lat, data.lng]);
  }

  // Play beep if driver is active
  if (myStatus === "active") {
    const beep = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    beep.play().catch(() => {});
  }
});

// --- Student stops or server cancels ---
socket.on("studentStopRequest", (id) => {
  if (studentMarkers[id]) {
    map.removeLayer(studentMarkers[id]);
    delete studentMarkers[id];
  }
});

// --- aggregated studentsUpdate (reconcile) ---
socket.on("studentsUpdate", (arr) => {
  // arr might be array of { id, lat, lng, expiry }
  const ids = new Set(arr.map((s) => s.id));
  arr.forEach((s) => {
    if (!studentMarkers[s.id]) {
      studentMarkers[s.id] = L.marker([s.lat, s.lng], { icon: studentIcon(false) })
        .addTo(map)
        .bindTooltip("Student requesting ride", { direction: "top" });
    } else {
      studentMarkers[s.id].setLatLng([s.lat, s.lng]);
    }
  });

  for (let id in studentMarkers) {
    if (!ids.has(id)) {
      map.removeLayer(studentMarkers[id]);
      delete studentMarkers[id];
    }
  }
});

// Cleanup on manual disconnect (optional)
window.addEventListener("beforeunload", () => {
  // Let server handle disconnect events; optional cleanup here
});

initMap();
