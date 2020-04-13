import * as d3 from 'd3';
import Vue from 'vue';

type Display = {
	confirmed_now: number;
	deaths_now: number;
	recovered_now: number;
}

const svgIDTreemap = "svgtreemap";
const treemapUrl = "/data/daily_reports/summary.json";

type Box = {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

type DatasetSimple = {
	date: string;
	cdr: [number, number, number];
}

type CountrySimple = {
	daily: DatasetSimple[];
	cdr: [number, number, number];
}

type Summary = {
	countrys: {
		[key in string]: CountrySimple;
	}
	cdr: [number, number, number];
}

type ChildrenHierarchy = {
	name: string,
	children?: ChildrenHierarchy[];
	value: number;
}

type RootHierarchy = {
	name: string;
	children: ChildrenHierarchy[];
}

class TreemapChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private root?: RootHierarchy;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 850;
		this.width = this.width - this.margin.left - this.margin.right;
		this.height = 460 - this.margin.top - this.margin.bottom;

		this.svg = d3.select("#" + this.svgid).append("svg");
		this.svg
			.attr("width", this.width + this.margin.left + this.margin.right + 10)
			.attr("height", this.height + this.margin.top + this.margin.bottom + 10);
	}
	public dispose(): void {
		const doc = document.getElementById(this.svgid);
		if (doc) {
			doc.innerHTML = "";
		}
	}
	public addData(data: Summary): void {
		// SummaryからRootHierarchyに変換する何か
	}
	public draw(): void {
		let treemap = d3.treemap()
			.size([this.width, this.height])
			.padding(1)
			.round(true);

		let root = d3.hierarchy(this.root);
		treemap(root);
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