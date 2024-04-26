import data from './data.js';
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let colorGroupList = {};
console.log(data);

function chart() {
    const width = screen.width;
    const height = screen.height;
    const color = d3.scaleSequential(interpolateAngry);

    const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(50)) // verringerte Anziehungskraft zwischen den Nodes und den Verbindungen
        .force("charge", d3.forceManyBody().strength(-300)) // erhöhte Abstoßungskraft zwischen den Nodes
        .force("center", d3.forceCenter(width / 2, height / 2))
        .on("tick", ticked);

    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height])
        .attr("class", "svg-container"); // Apply CSS class to SVG container

    const graph = svg.append("g");

    const link = graph.append("g")
        .attr("class", "link") // Apply CSS class to links
        .selectAll()
        .data(data.links)
        .join("line")
        .attr("stroke", d => { //group has to be set up correctly
            if (!colorGroupList[d.value]) {
                // If not, generate a random color and store it
                colorGroupList[d.value] = Math.random();
            }
            return color(colorGroupList[d.value]);
        });

    const defs = graph.append("defs");

    defs.append("clipPath")
        .attr("id", "imageClip")
        .append("circle")
        .attr("r", 10); // Radius of the circle to clip the image

    const node = graph.append("g")
        .attr("class", "node")
        .selectAll()
        .data(data.nodes)
        .join("g")
        .attr("class", "node-group")
        .append("a")
        .attr("href", "https://www.google.com/?hl=de")
        .attr("target", "_blank")
        .append("image")
        .attr("xlink:href", d => {
            let url = d.url;
            if (url == null) {
                return "https://woodfibreinsulation.co.uk/wp-content/uploads/2017/04/blank-profile-picture-973460-1-1-1024x1024.png";
            } else {
                return url;
            }
        })
        .attr("width", 20)
        .attr("height", 20)
        .attr("x", -10)
        .attr("y", -10)
        .attr("clip-path", "url(#imageClip)"); // Apply clipping path here

    node.append("title")
        .text(d => d.id);

    node.call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    function ticked() {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    }

    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", zoomed);

    svg.call(zoom);

    function zoomed(event) {
        graph.attr("transform", event.transform);
    }

    return svg.node();
}

let svgElement = chart();
document.body.appendChild(svgElement);

function interpolateAngry(t) {
    return d3.hsl(
        t * 360,
        1,
        0.5
    );
}