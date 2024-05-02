import UserGraphVisualization from "./graph/graph";
import GraphToolbar from "./toolbar/toolbar";
import MaterialIcon from "./material-icon/material-icon";
import {User, UserGraph} from "../instagram/user";
import './layout.css'

customElements.define('user-graph', UserGraphVisualization)
customElements.define('graph-toolbar', GraphToolbar)
customElements.define('material-icon', MaterialIcon)


window.addEventListener("DOMContentLoaded", () => {
    const data = decodeURIComponent(atob("REPLACE-ME-WITH-USER-GRAPH"))
    const graph: UserGraph = JSON.parse(data)

    const visualization = document.querySelector("user-graph") as UserGraphVisualization;
    visualization.setAttribute(UserGraphVisualization.graphAttribute, data)

    const toolbar = document.querySelector("graph-toolbar") as GraphToolbar;
    toolbar.addEventListener("remove-highlighting", () => visualization.removeHighlights());
    toolbar.addEventListener("reset-positioning", () => visualization.resetPositioning())

    toolbar.addEventListener("search-user", function (event: CustomEvent) {
        const matchingUser = Object.values(graph).find((user: User) => user.profile.username === event.detail);

        if (!matchingUser) return toolbar.setSearchError(`No user found with the exact username: ${event.detail}`)

        visualization.highlightUserLinks(matchingUser as User);
        toolbar.clearSearch();
    });
})
