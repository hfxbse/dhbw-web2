// Function to fill in the data
function fillData() {
    const data = new Map();
    data.set("User 1", ["User 2", "User 3", "User 4"]);
    data.set("User 2", ["User 1", "User 3"]);
    data.set("User 3", ["User 1", "User 2", "User 4", "User 5", "User 6", "User 7", "User 8"]);
    data.set("User 4", ["User 1", "User 3", "User 5", "User 6", "User 7", "User 8"]);
    data.set("User 5", ["User 3", "User 4", "User 6", "User 7", "User 8"]);
    data.set("User 6", ["User 3", "User 4", "User 5", "User 7", "User 8"]);
    data.set("User 7", ["User 3", "User 4", "User 5", "User 6", "User 8"]);
    data.set("User 8", ["User 3", "User 4", "User 5", "User 6", "User 7"]);
    return data;
}

// Function to convert the map to an array of objects
function mapToArray(dataMap) {
    const dataArray = [];
    const nodeNames = Array.from(dataMap.keys());

    nodeNames.forEach((name, index) => {
        const connections = dataMap.get(name).map(targetName => nodeNames.indexOf(targetName));
        dataArray.push({ name, connections });
    });

    return dataArray;
}

// Generate the data
const dataMap = fillData();
const data = mapToArray(dataMap);

// Create SVG
const svg = d3.select("#graph");
const width = window.innerWidth;
const height = window.innerHeight;
svg.attr("width", width).attr("height", height);
// Append a semi-transparent rectangle to create a dark overlay
svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "rgba(0, 0, 0, 1)") // Adjust the opacity as needed
    .attr("class", "darkscreen")
    .lower(); // Ensure the darkscreen is behind other elements

invertColors();
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
    .data(data.flatMap(d => d.connections.map(target => ({ source: d, target: data[target] }))))
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
node.on("click", function(event, d) {
    if (selectedNode === d) {
        unselectNode();
        return;
    }
    selectedNode = d;
    resetNodeColors(); // Reset node colors
    highlightedNode = d;
    highlightNodes();
    d3.select(this).style("fill", "red"); // Set the clicked node color
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
    link.classed("highlighted", d => d.source === highlightedNode || d.target === highlightedNode);
}

// Function to unselect the current node
function unselectNode() {
    selectedNode = null;
    resetNodeColors(); // Reset node colors
    node.classed("highlighted", false); // Remove highlighting from nodes
    link.classed("highlighted", false); // Remove highlighting from links
}

// Function to reset node colors
function resetNodeColors() {
    node.style("fill", "steelblue");
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

// Function to invert colors
function invertColors() {
    svg.classed("inverted", true); // Apply the inverted class to the SVG
    // Apply the inverted class to all child elements of the SVG
    svg.selectAll("*").classed("inverted", true);
}
