import UserGraphVisualization from "./graph/graph";
import GraphToolbar from "./toolbar/toolbar";
import example from './example'
import './layout.css'
import {User} from "../instagram/user";

customElements.define('user-graph', UserGraphVisualization)
customElements.define('graph-toolbar', GraphToolbar)


window.addEventListener("DOMContentLoaded", () => {
    const visualization = document.querySelector("user-graph") as UserGraphVisualization;
    visualization.setAttribute(UserGraphVisualization.graphAttribute, JSON.stringify(example))

    const toolbar = document.querySelector("graph-toolbar") as GraphToolbar;

    toolbar.addEventListener("reset-graph", () => visualization.removeHighlights());
    toolbar.addEventListener("search-user", function (event: CustomEvent) {
        let matchingUser = Object.values(example).find((user: User) => user.profile.username === event.detail);

        if (matchingUser) {
            // Highlight the associated links
            visualization.highlightUserLinks(matchingUser); // No need to pass 'link' here
            console.log("Node found!");
        } else {
            // Node not found, you can display an error message or handle it accordingly
            console.log("Node not found!");
        }
    });
})
