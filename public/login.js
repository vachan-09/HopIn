document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const role = document.getElementById("role").value;

  if (!email || !password || !role) {
    alert("Please fill in all fields!");
    return;
  }

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });

    const data = await res.json();

    if (data.success) {
      // Save user info in local storage
      localStorage.setItem("email", email);
      localStorage.setItem("role", role);

      // Redirect based on role
      if (role === "student") {
        window.location.href = "/student.html";
      } else if (role === "driver") {
        window.location.href = "/driver.html";
      }
    } else {
      alert(data.message || "Invalid login. Try again.");
    }
  } catch (err) {
    console.error("Login error:", err);
    alert("Server error. Please try again later.");
  }
});
