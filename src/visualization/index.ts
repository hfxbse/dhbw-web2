import UserGraphVisualization from "./graph/graph";
import GraphToolbar from "./toolbar/toolbar";
import MaterialIcon from "./material-icon/material-icon";
import UserCount from "./user-count/user-count";
import {User, UserGraph} from "../instagram/user";
import './layout.css'

customElements.define('user-graph', UserGraphVisualization)
customElements.define('graph-toolbar', GraphToolbar)
customElements.define('material-icon', MaterialIcon)
customElements.define('user-count', UserCount)


window.addEventListener("DOMContentLoaded", async () => {
    const data = decodeURIComponent(atob("REPLACE-ME-WITH-USER-GRAPH"))
    const graph: UserGraph = JSON.parse(data)
    const users = Object.values(graph)

    document.querySelector('user-count').setAttribute(UserCount.countAttribute, users.length.toString(10))

    const visualization = document.querySelector("user-graph") as UserGraphVisualization;
    visualization.setAttribute(UserGraphVisualization.graphAttribute, data)

    const toolbar = document.querySelector("graph-toolbar") as GraphToolbar;
    toolbar.addEventListener("remove-highlighting", () => visualization.removeHighlights());
    toolbar.addEventListener("reset-positioning", () => visualization.resetPositioning())

    toolbar.addEventListener("search-user", function (event: CustomEvent) {
        const matchingUser = users.find((user: User) => user.profile.username === event.detail);

        if (!matchingUser) return toolbar.setSearchError(`No user found with the exact username: ${event.detail}`)

        visualization.highlightUserLinks(matchingUser as User);
        toolbar.clearSearch();
    });
})
