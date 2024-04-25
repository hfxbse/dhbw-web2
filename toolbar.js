let tokenValidated = false; // Variable to track if token is validated
document.addEventListener("DOMContentLoaded", function() {

    let logButton = document.getElementById("logButton");
    logButton.addEventListener("click", function(event) {
        // Prevent the default behavior of the button click event
        event.preventDefault();

        // Toggle text between "Login" and "Logout"
        if (logButton.textContent === "Login") {
            logButton.textContent = "Logout";
            // Display login modal when log-in button is clicked
            document.getElementById("loginModal").style.display = "block";
        } else {
            logButton.textContent = "Login";
            handleLogout(); // Log out when toggling to "Login"
        }
    });

    let loginButton = document.getElementById("loginButton");
    loginButton.addEventListener("click", function() {
        // Call a function to handle login when login button is clicked
        handleLogin();
    });

    // Close button event listeners for modals
    let closeButtons = document.querySelectorAll(".close");
    closeButtons.forEach(function(button) {
        button.addEventListener("click", function() {
            // Log out when any modal is closed
            handleLogout();
            // Close the modal
            this.closest('.modal').style.display = 'none';
        });
    });
});

function sendToScript(input) {
    // You can do whatever you want with the input here, for example, log it
    console.log("User input:", input);
}

function handleLogin() {
    // Retrieve username and password from input fields
    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;

    // Handle here login validation
    // For now, just logging them
    console.log("Username:", username);
    console.log("Password:", password);

    var loginSucceeded = true;

    if (loginSucceeded) {
        // Clear the username and password fields
        document.getElementById("username").value = "";
        document.getElementById("password").value = "";
        // Close the login modal after handling login
        document.getElementById("loginModal").style.display = "none";

        // Display token input modal
        document.getElementById("tokenModal").style.display = "block";
    } else {
        // Clear the username and password fields
        document.getElementById("username").value = "";
        document.getElementById("password").value = "";
    }
}

function handleLogout() {
    // handle logout here
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("token").value = "";
    let logButton = document.getElementById("logButton");
    logButton.textContent = "Login";

    // disable searchBox
    let searchBox = document.getElementById("searchBox");
    searchBox.disabled = true;
}

function handleTokenValidation() {
    // Retrieve token from input field
    let token = document.getElementById("token").value;

    // You can do whatever you want with the token here
    // For now, just logging it
    console.log("Token:", token);

    // Clear the token field
    document.getElementById("token").value = "";

    // Close the token input modal after handling token validation
    document.getElementById("tokenModal").style.display = "none";

    // Enable search box after successful token validation
    let searchBox = document.getElementById("searchBox");
    searchBox.disabled = false;

    // Update token validation status
    tokenValidated = true;

    // Set up event listener for searchBox after enabling it
    searchBox.addEventListener("keypress", function(event) {
        if (event.key === "Enter" && tokenValidated) { // Enable search box only if token is validated
            var userInput = searchBox.value;
            sendToScript(userInput);
            searchBox.value = ""; // Clear the searchBox value after sending input
        }
    });
}
