import * as d3 from "d3";
import {placeholderImage} from "./placeholder";
import {User, UserGraph} from "../../instagram/user";
import './graph.css'

export interface D3UserGraphLink {
    source: number,
    target: number
}

export interface D3UserGraph {
    nodes: User[],
    links: D3UserGraphLink[]
}

type HTMLAttribute = undefined | null | number | string | boolean

export default class UserGraphVisualization extends HTMLElement {
    static graphAttribute = 'graph'

    graph: UserGraph = {} as UserGraph

    // noinspection JSUnusedGlobalSymbols
    static get observedAttributes() {
        return [UserGraphVisualization.graphAttribute]
    }

    // noinspection JSUnusedGlobalSymbols
    attributeChangedCallback(property: string, oldValue: HTMLAttribute, newValue: HTMLAttribute) {
        if (oldValue === newValue) return;

        if (property === UserGraphVisualization.graphAttribute) {
            this.graph = JSON.parse(newValue.toString())
            this.setSimulation(this.createSimulation(this.toD3UserGraph(this.graph)))
        } else {
            this[property] = newValue;
        }
    }

    // noinspection JSUnusedGlobalSymbols
    connectedCallback() {
        this.setSimulation(this.createSimulation(this.toD3UserGraph(this.graph)))
    }

    setSimulation(svg: HTMLElement) {
        while (this.childElementCount > 0) {
            this.removeChild(this.lastChild)
        }

        this.append(svg)
    }

    toD3UserGraph(graph: UserGraph): D3UserGraph {
        return Object.values(graph).reduce((d3graph, user) => {
            d3graph.nodes.push(user)

            user.followerIds?.map(followerId => {
                return {source: user.id, target: followerId}
            })?.forEach(link => d3graph.links.push(link))

            return d3graph
        }, {nodes: [], links: []})
    }

    interpolateAngry(t) {
        return d3.hsl(
            t * 360,
            1,
            0.5
        );
    }

    colorGroupList = {};
    color = d3.scaleSequential(this.interpolateAngry);

    matchWindowSize(simulation, svg) {
        const width = screen.width
        const height = screen.height

        svg.attr("viewBox", [0, 0, width, height])
        simulation.force("center", d3.forceCenter(width / 2, height / 2))
    }

    createSimulation(graph: D3UserGraph): HTMLElement {
        const simulation = d3.forceSimulation(graph.nodes)
            .force("link", d3.forceLink(graph.links).id(d => d.id).distance(50))
            .force("charge", d3.forceManyBody().strength(-300))

        const svg = d3.create("svg")

        this.matchWindowSize(simulation, svg)
        window.addEventListener("resize", () => this.matchWindowSize(simulation, svg))

        const canvas = svg.append("g");

        const link = canvas.append("g")
            .attr("class", 'link')
            .selectAll()
            .data(graph.links)
            .join("line");

        const defs = canvas.append("defs");

        defs.append("clipPath")
            .attr("id", "imageClip")
            .append("circle")
            .attr("r", 10);

        const node = canvas.append("g")
            .attr("class", 'node')
            .selectAll()
            .data(graph.nodes)
            .join("g")
            .attr("class", "node-group")
            .append("image")
            .attr("xlink:href", (user: User) => user.profile.image ?? placeholderImage)
            .attr("width", 20)
            .attr("height", 20)
            .attr("x", -10)
            .attr("y", -10)
            .attr("clip-path", "url(#imageClip)")
            .on("click", (_, d) => this.onClick(link, d))
            .on("dblclick", (_, user: User) => window.open(`https://instagram.com/${user.profile.username}`, '_blank'))

        node.append("title")
            .text(d => d.profile.username);

        node.call(d3.drag()
            .on("start", (event) => this.onDrag.start(simulation, event))
            .on("drag", (event) => this.onDrag.drag(event))
            .on("end", (event) => this.onDrag.end(simulation, event)));


        simulation.on("tick", () => this.ticked(link, node));

        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => this.onZoom(canvas, event));

        svg.call(zoom);

        return svg.node()
    }

    ticked(link, node) {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    }

    onDrag = {
        start(simulation, event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        },
        drag(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        },
        end(simulation, event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }
    }

    onZoom(canvas, event) {
        const source = event.sourceEvent

        if (source instanceof MouseEvent && source.type === 'dblclick') return

        canvas.attr("transform", event.transform);
    }

    onClick(link, d) {
        const clickedNodeId = d.id;
        const linksToUpdate = link.filter(linkData => linkData.source.id === clickedNodeId || linkData.target.id === clickedNodeId);

        if (!this.colorGroupList[d.id]) {
            this.colorGroupList[d.id] = Math.random();
        }

        const clickedColor = this.color(this.colorGroupList[d.id]);
        const isColored = linksToUpdate.attr("stroke") === clickedColor.toString();

        if (isColored) {
            linksToUpdate.transition().duration(500).attr("stroke", "#999");
            delete this.colorGroupList[d.id];
        } else {
            linksToUpdate.transition().duration(500).attr("stroke", clickedColor);
        }
    }

    highlightUserLinks(user: User) {
        // Select the SVG elements representing the links associated with the clicked node
        const linksToUpdate = d3.selectAll(".link line")
            .filter(link => link.source.id === user.id || link.target.id === user.id);

        if (!this.colorGroupList[user.id]) {
            this.colorGroupList[user.id] = Math.random();
        }

        const clickedColor = this.color(this.colorGroupList[user.id]);
        linksToUpdate.transition().duration(500).attr("stroke", clickedColor);
    }

    removeHighlights() {
        // Select all links
        const links = this.querySelectorAll(".link line");

        // Reset the color of each link to the default color set by the css style sheet
        links.forEach(link => link.removeAttribute("stroke"));

        // Optionally, clear the colorGroupList object
        this.colorGroupList = {};
    }
}
