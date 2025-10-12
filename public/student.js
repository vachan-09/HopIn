// public/student.js (complete, paste over)
const socket = io();

let map;
let myMarker = null;
let myLocation = null;
let requesting = false;
let localRequestTimeout = null;

let otherStudentMarkers = {}; // { id: marker }
let driverMarkers = {}; // { id: marker }

// Icons
const normalStudentIcon = L.divIcon({
  className: "student-emoji",
  html: `<div style="font-size:30px;">🧍🏻‍♂️</div>`,
});

const glowingStudentIcon = L.divIcon({
  className: "student-emoji glow",
  html: `<div style="font-size:30px;">🧍🏻‍♂️</div>`,
});

const activeDriverIcon = (size = 35) => L.divIcon({ className: "driver-emoji active", html: `<div style="font-size:${size}px;">🚘</div>` });
const breakDriverIcon = (size = 35) => L.divIcon({ className: "driver-emoji break", html: `<div style="font-size:${size}px;">🚖</div>` });

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

        if (!myMarker) {
          myMarker = L.marker([latitude, longitude], { icon: normalStudentIcon })
            .addTo(map)
            .bindTooltip("You (Student)", { direction: "top" });
          map.setView([latitude, longitude], 17);
        } else {
          myMarker.setLatLng([latitude, longitude]);
        }

        // Always send live location
        socket.emit("studentLocation", { lat: latitude, lng: longitude });
      },
      (err) => {
        console.error("Geolocation error:", err);
        alert("Please enable location access.");
      },
      { enableHighAccuracy: true }
    );
  } else {
    alert("Geolocation not supported.");
  }
}

// UI buttons
const requestBtn = document.getElementById("requestRide");
const stopBtn = document.getElementById("stopRequest");

requestBtn.addEventListener("click", () => {
  if (!myLocation) return alert("Wait for location to become available.");
  requesting = true;
  requestBtn.style.display = "none";
  stopBtn.style.display = "inline-block";

  socket.emit("startRequest", myLocation);

  if (myMarker) myMarker.setIcon(glowingStudentIcon);

  // local UI timeout
  if (localRequestTimeout) clearTimeout(localRequestTimeout);
  localRequestTimeout = setTimeout(() => {
    if (requesting) stopRequest(true);
  }, 5 * 60 * 1000);
});

stopBtn.addEventListener("click", () => stopRequest(false));

function stopRequest(auto = false) {
  requesting = false;
  requestBtn.style.display = "inline-block";
  stopBtn.style.display = "none";

  if (localRequestTimeout) {
    clearTimeout(localRequestTimeout);
    localRequestTimeout = null;
  }

  socket.emit("stopRequest");
  if (myMarker) myMarker.setIcon(normalStudentIcon);

  if (auto) alert("Your ride request timed out and was cancelled after 5 minutes.");
}

// --- Drivers update
socket.on("driversUpdate", (drivers) => {
  for (let id in drivers) {
    const d = drivers[id];
    const icon = d.status === "break" ? breakDriverIcon() : activeDriverIcon();
    if (!driverMarkers[id]) {
      driverMarkers[id] = L.marker([d.lat, d.lng], { icon })
        .addTo(map)
        .bindTooltip(`Rickshaw #${String(d.number).padStart(3, "0")} - ${d.status}`, { direction: "top" });
    } else {
      driverMarkers[id].setLatLng([d.lat, d.lng]);
      driverMarkers[id].setIcon(icon);
      driverMarkers[id].bindTooltip(`Rickshaw #${String(d.number).padStart(3, "0")} - ${d.status}`, { direction: "top" });
    }
  }

  for (let id in driverMarkers) {
    if (!drivers[id]) {
      map.removeLayer(driverMarkers[id]);
      delete driverMarkers[id];
    }
  }
});

// --- Students requesting update (array expected)
socket.on("studentsUpdate", (requestingStudents) => {
  // requestingStudents might be array of { id, lat, lng, expiry } OR object; handle array
  const arr = Array.isArray(requestingStudents) ? requestingStudents : Object.values(requestingStudents || {});
  const ids = new Set(arr.map(s => s.id));

  arr.forEach(s => {
    if (s.id === socket.id) return; // skip self if desired
    if (!otherStudentMarkers[s.id]) {
      otherStudentMarkers[s.id] = L.marker([s.lat, s.lng], { icon: normalStudentIcon })
        .addTo(map)
        .bindTooltip("Student requesting ride", { direction: "top" });
    } else {
      otherStudentMarkers[s.id].setLatLng([s.lat, s.lng]);
    }
  });

  for (let id in otherStudentMarkers) {
    if (!ids.has(id)) {
      map.removeLayer(otherStudentMarkers[id]);
      delete otherStudentMarkers[id];
    }
  }
});

socket.on("studentRequest", (data) => {
  // incoming one-off request
  if (data.id === socket.id) return;
  if (!otherStudentMarkers[data.id]) {
    otherStudentMarkers[data.id] = L.marker([data.lat, data.lng], { icon: glowingStudentIcon })
      .addTo(map)
      .bindTooltip("Student requesting ride", { direction: "top" });
  } else {
    otherStudentMarkers[data.id].setLatLng([data.lat, data.lng]);
  }
});

socket.on("studentStopRequest", (id) => {
  if (otherStudentMarkers[id]) {
    map.removeLayer(otherStudentMarkers[id]);
    delete otherStudentMarkers[id];
  }
});

// Logout button functionality
document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});


initMap();
