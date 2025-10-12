const socket = io();

// --- Initialize map ---
const map = L.map("map").setView([28.6139, 77.2090], 17); // example center (Delhi)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

// --- Student location management ---
let userMarker = null;
let studentWatchId = null;
let requestTimer = null;
let isRequesting = false;

// show student’s own location
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    userMarker = L.marker([lat, lng], { title: "You" })
      .addTo(map)
      .bindPopup("You are here")
      .openPopup();
    map.setView([lat, lng], 17);
  });
} else {
  alert("Geolocation not supported");
}

const requestBtn = document.getElementById("requestRideBtn");
const stopBtn = document.getElementById("stopRequestBtn");

// start sharing location
requestBtn.onclick = () => {
  if (!navigator.geolocation) return alert("GPS not supported");

  requestBtn.disabled = true;
  stopBtn.disabled = false;
  isRequesting = true;
  alert("Ride request started. Your location will be visible to drivers for 5 minutes.");

  studentWatchId = navigator.geolocation.watchPosition((pos) => {
    socket.emit("studentRequest", {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude
    });
  });

  // auto stop after 5 minutes
  requestTimer = setTimeout(() => {
    stopRequest();
    alert("Request automatically stopped after 5 minutes.");
  }, 5 * 60 * 1000);
};

// stop sharing location
stopBtn.onclick = () => stopRequest();

function stopRequest() {
  if (!isRequesting) return;
  isRequesting = false;

  if (studentWatchId !== null) {
    navigator.geolocation.clearWatch(studentWatchId);
    studentWatchId = null;
  }
  if (requestTimer) {
    clearTimeout(requestTimer);
    requestTimer = null;
  }
  socket.emit("studentCancel");
  requestBtn.disabled = false;
  stopBtn.disabled = true;
}

// --- Driver side (for demo on same page) ---
let studentMarker = null;

socket.on("studentLocation", (pos) => {
  if (!pos) return;
  if (studentMarker) {
    studentMarker.setLatLng([pos.lat, pos.lng]);
  } else {
    studentMarker = L.marker([pos.lat, pos.lng], { color: "blue" })
      .addTo(map)
      .bindPopup("Student requesting ride");
  }
});

socket.on("studentCancelled", () => {
  if (studentMarker) {
    map.removeLayer(studentMarker);
    studentMarker = null;
  }
});
