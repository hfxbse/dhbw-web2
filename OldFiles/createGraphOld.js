//import {readDataFromFile} from "./jsonReader.mjs";

function fillData() {
    const data = new Map();
    data.set("User 1", ["User 2", "User 3", "User 4"]);
    data.set("User 2", ["User 1", "User 3"]);
    data.set("User 3", ["User 1", "User 2", "User 4", "User 5", "User 6", "User 7"]);
    data.set("User 4", ["User 1", "User 3", "User 5", "User 6", "User 7", "User 8"]);
    data.set("User 5", ["User 3", "User 4", "User 6", "User 7", "User 8"]);
    data.set("User 6", ["User 3", "User 4", "User 5", "User 7", "User 8"]);
    data.set("User 7", ["User 3", "User 4", "User 5", "User 6", "User 8"]);
    data.set("User 8", ["User 5", "User 6", "User 7"]);
    data.set("User 9", ["User 5", "User 6", "User 7"]);
    return data;
}

// Function to convert the map to an array of objects
function mapToArray(dataMap) {
    const dataArray = [];
    const nodeNames = Array.from(dataMap.keys());

    nodeNames.forEach((name, index) => {
        const connections = dataMap.get(name).map(targetName => nodeNames.indexOf(targetName));
        dataArray.push({name, connections});
    });

    return dataArray;
}

// Generate the data
const dataMap = fillData();
const data = mapToArray(dataMap);
//const data = readDataFromFile();

console.log("Data read from file:", data);

// Create SVG
const svg = d3.select("#graph");
const width = window.innerWidth;
const height = window.innerHeight;
svg.attr("width", width).attr("height", height);

const graph = svg.append("g");

// Create force simulation
const simulation = d3.forceSimulation(data)
    .force("link", d3.forceLink().id(d => d.name))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(10));

// Create links
const link = graph.append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(data.flatMap(d => d.connections.map(target => ({source: d, target: data[target]}))))
    .join("line");

// Create nodes
const node = graph.append("g")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("r", 5)
    .attr("fill", "steelblue")
    .attr("class", "node")
    .call(drag(simulation));

// Define a variable to keep track of the currently selected node
let selectedNode = null;

// Handle click event on nodes
node.on("click", function (event, d) {
    if (selectedNode === d) {
        unselectNode();
        return;
    }

    selectedNode = d;
    resetNodeColors(); // Reset node colors
    highlightedNode = d;
    highlightNodes();
    d3.select(this).classed("sourceHighlighted", true);
    d3.select(this).classed("faded", false);
});

// Add title to nodes
node.append("title")
    .text(d => d.name);

// Add text for node names
const text = graph.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("dx", 12)
    .attr("dy", ".35em")
    .text(d => d.name);

// Update node and link positions on each tick of simulation
simulation.on("tick", () => {
    link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

    text
        .attr("x", d => d.x)
        .attr("y", d => d.y);
});

// Highlight clicked node and its connections
let highlightedNode = data[0];

function highlightNodes() {
    node.classed("faded", d => !highlightedNode.connections.includes(data.findIndex(node => node.name === d.name)));
    node.classed("highlighted", d => highlightedNode.connections.includes(data.findIndex(node => node.name === d.name)));

    link.classed("linkHighlighted", d => (d.target === highlightedNode));
    link.classed("linkHighlighted", d => (d.source === highlightedNode));
}

// Function to unselect the current node
function unselectNode() {
    selectedNode = null;
    resetNodeColors();
    node.classed("faded", false);
    link.classed("faded", false);
}

// Function to reset node colors
function resetNodeColors() { //remove highlighted
    node.classed("highlighted", false);
    node.classed("sourceHighlighted", false);
    link.classed("highlighted", false);
    link.classed("linkHighlighted", false);
    link.classed("linkTargetHighlighted", false);
}

// Define drag behavior
function drag(simulation) {
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

    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}

// Zoom functionality
const zoom = d3.zoom()
    .scaleExtent([0.1, 10]) // set the range of zoom
    .on("zoom", zoomed); // when zooming, call zoomed function

svg.call(zoom); // call zoom on the SVG element

function zoomed(event) {
    graph.attr("transform", event.transform); // adjust the graph's transform based on the zoom event
}