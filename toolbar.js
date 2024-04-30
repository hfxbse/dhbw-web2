document.addEventListener("DOMContentLoaded", function() {
    let searchBox = document.getElementById("searchBox");
    searchBox.addEventListener("keypress", function(event) {
        if (event.key === "Enter") { // Enable search box only if token is validated
            var userInput = searchBox.value;
            // use input to highlight it in node
            searchBox.value = ""; // Clear the searchBox value after sending input
        }
    });
});
