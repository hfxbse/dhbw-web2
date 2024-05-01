import UserGraphVisualization from "./graph/graph";
import example from './example'
import './layout.css'
import {User} from "../instagram/user";

customElements.define('user-graph', UserGraphVisualization)


window.addEventListener("DOMContentLoaded", () => {
    const visualization = document.querySelector("user-graph") as UserGraphVisualization;
    visualization.setAttribute(UserGraphVisualization.graphAttribute, JSON.stringify(example))

    let searchBox: HTMLInputElement = document.getElementById("searchBox") as HTMLInputElement;
    searchBox.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            let userInput = searchBox.value.trim(); // Trim to remove any leading/trailing spaces

            // Find the node in the graph data that matches the user input
            let matchingUser = Object.values(example).find((user: User) => user.profile.username === userInput);

            if (matchingUser) {
                // Highlight the associated links
                visualization.highlightUserLinks(matchingUser); // No need to pass 'link' here
                console.log("Node found!");
            } else {
                // Node not found, you can display an error message or handle it accordingly
                console.log("Node not found!");
            }

            searchBox.value = ""; // Clear the searchBox value after sending input
        }
    });

    document.getElementById("clearColors").addEventListener("click", () => visualization.removeHighlights());
})
