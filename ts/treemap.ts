import * as d3 from 'd3';
import Vue from 'vue';

type Display = {
	confirmed_now: number;
	deaths_now: number;
	recovered_now: number;
}

const svgIDTreemap = "svgtreemap";
const treemapUrlToday = "/data/daily_reports/today.json";

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

type NumberStr = "confirmed" | "deaths" | "recovered";

class TreemapChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private nodes?: HierarchyDatum;
	private data?: DailyData;
	private target: NumberStr;
	private colors: d3.ScaleOrdinal<string, string>;
	private now: { [key in NumberStr]: number };

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1560;
		this.width = this.width - this.margin.left - this.margin.right;
		this.height = 960 - this.margin.top - this.margin.bottom;
		this.colors = d3.scaleOrdinal(d3.schemeCategory10);
		this.target = "confirmed";
		this.now = {
			confirmed: 0,
			deaths: 0,
			recovered: 0
		};

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
	private clear(): void {
		d3.select("svg").remove();
	}
	private childrenWalk(key: string, data: Dataset): HierarchyDatum {
		const hd: HierarchyDatum = {
			name: key,
			value: data[this.target]
		};
		for (const objkey in data.children) {
			if (!data.hasOwnProperty(objkey)) {
				continue;
			}
			if (data.children) {
				if (!hd.children) {
					hd.children = [];
				}
				hd.children.push(this.childrenWalk(key, data.children[objkey]));
			}
		}
		return hd;
	}
	private changeData(target: NumberStr): void {
		if (!this.data) {
			return;
		}
		this.nodes = {
			name: "世界の様子",
			value: 0,
			children: []
		};
		this.target = target;
		for (const key in this.data) {
			if (!this.data.hasOwnProperty(key)) {
				continue;
			}
			this.nodes.children?.push(this.childrenWalk(key, this.data[key]));
			this.now.confirmed += this.data[key].confirmed;
			this.now.deaths += this.data[key].deaths;
			this.now.recovered += this.data[key].recovered;
		}
		dispdata.confirmed_now = this.now.confirmed;
		dispdata.deaths_now = this.now.deaths;
		dispdata.recovered_now = this.now.recovered;
	}
	public addData(data: DailyData): void {
		this.data = data;
		this.changeData("confirmed");
	}
	public draw(): void {
		if (!this.nodes) {
			// undefinedチェック
			return;
		}
		const nodes = d3.hierarchy(this.nodes).sum(d => d.value).sort((a, b) => b.data.value - a.data.value);
		const root = d3.treemap<HierarchyDatum>()
			.size([this.width, this.height])
			.padding(2)
			(nodes);

		this.svg.selectAll(".rect_data")
			.data(root.leaves())
			.enter()
			.append("rect")
			.attr('x', d => d.x0)
			.attr('y', d => d.y0)
			.attr('width', d => d.x1 - d.x0)
			.attr('height', d => d.y1 - d.y0)
			.style("stroke", "black")
			.style("fill", d => this.colors(d.data.name));

		type textfunc = ((d: d3.HierarchyRectangularNode<HierarchyDatum>) => string);
		type sizefunc = ((d: d3.HierarchyRectangularNode<HierarchyDatum>) => number);
		const textvisible = (func: textfunc): textfunc => {
			const min = this.now[this.target] / 2000;
			return (d: d3.HierarchyRectangularNode<HierarchyDatum>): string => {
				if (d.data.value < min) {
					return "";
				}
				return func(d);
			}
		};
		const fontsize: sizefunc = d => {
			let s = (((d.x1 - d.x0) + (d.y1 - d.y0)) / 2) / 5;
			if (s > 100) {
				s = 100;
			} else if (s < 8) {
				s = 8;
			}
			return s;
		}
		const numf = d3.format(",.3s");
		this.svg.selectAll(".text_country")
			.data(root.leaves())
			.enter()
			.append("text")
			.attr("x", d => d.x0 + 5)
			.attr("y", d => d.y0 + 5 + fontsize(d))
			.text(textvisible(d => d.data.name))
			.attr("font-size", d => fontsize(d) + "px")
			.attr("fill", "black");

		this.svg.selectAll(".text_value")
			.data(root.leaves())
			.enter()
			.append("text")
			.attr("x", d => d.x0 + 5)
			.attr("y", d => d.y0 + 5 + fontsize(d) * 2)
			.text(textvisible(d => "(" + numf(d.data.value) + ")"))
			.attr("font-size", d => fontsize(d) + "px")
			.attr("fill", "black");
	}
}

class Client {
	private treemap: TreemapChart;

	constructor() {
		this.treemap = new TreemapChart(svgIDTreemap);
		Client.ajax(treemapUrlToday, (xhr: XMLHttpRequest): void => {
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