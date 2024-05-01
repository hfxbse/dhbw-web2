import UserGraphVisualization from "./graph/graph";
import example from './example'
import './layout.css'

customElements.define('user-graph', UserGraphVisualization)

window.addEventListener("DOMContentLoaded", () => {
    document.querySelector("user-graph").setAttribute(UserGraphVisualization.graphAttribute, JSON.stringify(example))
})
