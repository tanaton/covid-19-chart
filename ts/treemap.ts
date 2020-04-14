import * as d3 from 'd3';
import Vue from 'vue';

type Display = {
	confirmed_now: number;
	deaths_now: number;
	recovered_now: number;
}

const svgIDTreemap = "svgtreemap";
const treemapUrl = "/data/daily_reports/now.json";

type Box = {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

type Dataset = {
	confirmed: number;
	deaths: number;
	recovered: number;
	last_update?: number;
	latitude?: number;
	longitude?: number;
	children?: {
		[key in string]: Dataset;
	}
}
type DailyData = {
	[key in string]: Dataset;
}

type HierarchyDatum = {
	name: string;
	value: number;
	children?: HierarchyDatum[];
}

class TreemapChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private nodes?: HierarchyDatum;
	private colors: d3.ScaleOrdinal<string, string>;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1560;
		this.width = this.width - this.margin.left - this.margin.right;
		this.height = 960 - this.margin.top - this.margin.bottom;
		this.colors = d3.scaleOrdinal(d3.schemeCategory10);

		this.svg = d3.select("#" + this.svgid).append("svg");
		this.svg
			.attr("width", this.width + this.margin.left + this.margin.right + 10)
			.attr("height", this.height + this.margin.top + this.margin.bottom + 10)
			.append("g")
			.attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");
	}
	public dispose(): void {
		const doc = document.getElementById(this.svgid);
		if (doc) {
			doc.innerHTML = "";
		}
	}
	public addData(data: DailyData): void {
		const f = (key: string, data: Dataset): HierarchyDatum => {
			const hd: HierarchyDatum = {
				name: key,
				value: data.confirmed
			};
			for (const objkey in data.children) {
				if (!data.hasOwnProperty(objkey)) {
					continue;
				}
				if (data.children) {
					if (!hd.children) {
						hd.children = [];
					}
					hd.children.push(f(key, data.children[objkey]));
				}
			}
			return hd;
		};
		this.nodes = {
			name: "世界の様子",
			value: 0,
			children: []
		};
		let c = 0;
		let d = 0;
		let r = 0;
		for (const key in data) {
			if (!data.hasOwnProperty(key)) {
				continue;
			}
			this.nodes.children?.push(f(key, data[key]));
			c += data[key].confirmed;
			d += data[key].deaths;
			r += data[key].recovered;
		}
		dispdata.confirmed_now = c;
		dispdata.deaths_now = d;
		dispdata.recovered_now = r;
	}
	public draw(): void {
		if (!this.nodes) {
			// undefinedチェック
			return;
		}
		const nodes = d3.hierarchy(this.nodes).sum(d => d.value);
		const root = d3.treemap<HierarchyDatum>()
			.size([this.width, this.height])
			.padding(2)
			(nodes);

		this.svg.selectAll("rect")
			.data(root.leaves())
			.enter()
			.append("rect")
			.attr('x', d => d.x0)
			.attr('y', d => d.y0)
			.attr('width', d => d.x1 - d.x0)
			.attr('height', d => d.y1 - d.y0)
			.style("stroke", "black")
			.style("fill", "slateblue");

		this.svg.selectAll("text")
			.data(root.leaves())
			.enter()
			.append("text")
			.attr("x", d => d.x0 + 5)    // +10 to adjust position (more right)
			.attr("y", d => d.y0 + 20)    // +20 to adjust position (lower)
			.text(d => d.data.name)
			.attr("font-size", "15px")
			.attr("fill", "white");
	}
}

class Client {
	private treemap: TreemapChart;

	constructor() {
		this.treemap = new TreemapChart(svgIDTreemap);
		Client.ajax(treemapUrl, (xhr: XMLHttpRequest): void => {
			this.treemap.addData(JSON.parse(xhr.responseText));
			this.treemap.draw();
		});
	}
	public dispose(): void {
		this.treemap?.dispose();
	}
	public static ajax(url: string, func: (xhr: XMLHttpRequest) => void, ) {
		const xhr = new XMLHttpRequest();
		xhr.ontimeout = (): void => {
			console.error(`The request for ${url} timed out.`);
		};
		xhr.onload = (e): void => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					func(xhr);
				} else {
					console.error(xhr.statusText);
				}
			}
		};
		xhr.onerror = (e): void => {
			console.error(xhr.statusText);
		};
		xhr.open("GET", url, true);
		xhr.timeout = 5000;		// 5秒
		xhr.send(null);
	}
}

const dispdata: Display = {
	confirmed_now: 0,
	deaths_now: 0,
	recovered_now: 0
};
const vm = new Vue({
	el: "#container",
	data: dispdata
});
const cli = new Client();