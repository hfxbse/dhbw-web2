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

export default class UserGraphVisualization extends HTMLElement {
    static graphAttribute = 'graph'

    graph: UserGraph = {} as UserGraph
    zoom: any = undefined
    visualization: any = undefined

    // noinspection JSUnusedGlobalSymbols
    static get observedAttributes() {
        return [UserGraphVisualization.graphAttribute]
    }

    // noinspection JSUnusedGlobalSymbols
    attributeChangedCallback(property: string, oldValue: string, newValue: string) {
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
        const width = window.innerWidth
        const height = window.innerHeight

        svg.attr("viewBox", [0, 0, width, height])
        simulation.force("center", d3.forceCenter(width / 2, height / 2))
    }

    createSimulation(graph: D3UserGraph): HTMLElement {
        const simulation = d3.forceSimulation(graph.nodes)
            .force("link", d3.forceLink(graph.links).id(d => d.id).distance(50))
            .force("charge", d3.forceManyBody().strength(-300))

        this.visualization = d3.create("svg")

        this.matchWindowSize(simulation, this.visualization)
        window.addEventListener("resize", () => this.matchWindowSize(simulation, this.visualization))

        const canvas = this.visualization.append("g");

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
            .text((user: User) => {
                const count = user.followerIds?.length ?? 0;

                return `${user.profile.name} @${user.profile.username} (${count} follower${count > 1 ? 's' : ''})`;
            });

        node.call(d3.drag()
            .on("start", (event) => this.onDrag.start(simulation, event))
            .on("drag", (event) => this.onDrag.drag(event))
            .on("end", (event) => this.onDrag.end(simulation, event)));


        simulation.on("tick", () => this.ticked(link, node));

        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => this.onZoom(canvas, event));

        this.visualization.call(this.zoom);

        return this.visualization.node()
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
        const linksToUpdate = link?.filter(linkData => linkData.source.id === clickedNodeId || linkData.target.id === clickedNodeId);

        if ((linksToUpdate?._groups[0]?.length ?? 0) < 1) return

        if (!this.colorGroupList[d.id]) {
            this.colorGroupList[d.id] = Math.random();
        }

        const clickedColor = this.color(this.colorGroupList[d.id]);
        const isColored = linksToUpdate.attr("stroke") != null;

        if (isColored) {
            linksToUpdate.attr("stroke", null);
            delete this.colorGroupList[d.id];
        } else {
            linksToUpdate.attr("stroke", clickedColor);
        }
    }

    highlightUserLinks(user: User) {
        // Select the SVG elements representing the links associated with the clicked node
        const linksToUpdate = d3.selectAll(".link line")
            .filter(link => link.source.id === user.id || link.target.id === user.id);

        if (!this.colorGroupList[user.id]) {
            this.colorGroupList[user.id] = Math.random();
        }

        linksToUpdate?.attr("stroke", this.color(this.colorGroupList[user.id]));
    }

    removeHighlights() {
        // Select all links
        const links = this.querySelectorAll(".link line");

        // Reset the color of each link to the default color set by the css style sheet
        links.forEach(link => link.removeAttribute("stroke"));

        // Optionally, clear the colorGroupList object
        this.colorGroupList = {};
    }

    resetPositioning() {
        this.visualization.call(this.zoom.transform, d3.zoomIdentity)
    }
}
