import * as d3 from 'd3';

export type Box = {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export type CDR = readonly [number, number, number];

export type DatasetSimple = {
	date: string,
	cdr: CDR
}
export type CountrySummary = {
	daily: readonly DatasetSimple[],
	cdr: CDR
}
export type WorldSummary = {
	countrys: { readonly [key in string]: CountrySummary },
	cdr: CDR
}

export type NumberStr = "confirmed" | "deaths" | "recovered";
export type ScaleStr = "liner" | "log";
export type NumberIndexType = { readonly [key in NumberStr]: number };

export interface IChart<ScaleT> {
	dispose(): void;
	clear(): void;
	changeData(target: NumberStr): void;
	resetScale(scale: ScaleT): void;
	addData(raw: WorldSummary): void;
	draw(): void;
}

export const NumberIndex: NumberIndexType = {
	confirmed: 0,
	deaths: 1,
	recovered: 2,
};

export const dayMillisecond = 60 * 60 * 24 * 1000;
export const timeFormat = d3.timeFormat("%Y%m%d");
export const formatNumberConmma = d3.format(",d");
export const formatNumberSuffix = d3.format(",.3s");
export const formatNumberFloat = d3.format(".2f");
export const line_xd_default: readonly [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
export const line_yd_default: readonly [number, number] = [0, 0];
export const base64encode = (str: string): string => window.btoa(unescape(encodeURIComponent(str)));
export const base64decode = (str: string): string => decodeURIComponent(escape(window.atob(str)));
export const atoi = (str: string): number => parseInt(str, 10);
export const strToDate = (str: string): Date => {
	if (str.length < 8) {
		// 日付文字列ではないかも
		return new Date(2020, 3, 1);
	}
	const datearray = [str.slice(0, 4), str.slice(4, 6), str.slice(6)].map<number>(atoi);
	// 月は-1しないと期待通りに動作しない
	return new Date(datearray[0], datearray[1] - 1, datearray[2]);
}
export const formatDateStr = (str: string): string => str.length < 8 ? "2020/04/01" : [str.slice(0, 4), str.slice(4, 6), str.slice(6)].join("/");
export const categoryDefault: NumberStr = "confirmed";
export const scaleDefault: ScaleStr = "liner";
export const countryDefault = "Japan";
export const datestrDefault = timeFormat(new Date(Date.now() - dayMillisecond * 2));
// https://www.colordic.org/m
export const metroColor = [
	"#ff9500",	// 銀座線オレンジ(2014)Ginza Line Orange
	"#f62e36",	// 丸ノ内線レッド(2014)Marunouchi Line Red
	"#b5b5ac",	// 日比谷線シルバー(2014)Hibiya Line Silver
	"#009bbf",	// 東西線スカイ(2014)Tozai Line Sky
	"#00bb85",	// 千代田線グリーン(2014)Chiyoda Line Green
	"#c1a470",	// 有楽町線ゴールド(2014)Yurakucho Line Gold
	"#8f76d6",	// 半蔵門線パープル(2014)Hanzomon Line Purple
	"#00ac9b",	// 南北線エメラルド(2014)Namboku Line Emerald
	"#9c5e31",	// 副都心線ブラウン(2014)Fukutoshin Line Brown
	"#f39700",	// 銀座線オレンジGinza Line Orange
	"#e60012",	// 丸の内線レッドMarunouchi Line Red
	"#9caeb7",	// 日比谷線シルバーHibiya Line Silver
	"#00a7db",	// 東西線スカイTozai Line Sky
	"#009944",	// 千代田線グリーンChiyoda Line Green
	"#d7c447",	// 有楽町線ゴールドYurakucho Line Gold
	"#9b7cb6",	// 半蔵門線パープルHanzomon Line Purple
	"#00ada9",	// 南北線エメラルドNamboku Line Emerald
	"#bb641d",	// 副都心線ブラウンFukutoshin Line Brown
	"#e85298",	// 浅草線ローズAsakusa Line Rose
	"#0079c2",	// 三田線ブルーMita Line Blue
	"#6cbb5a",	// 新宿線リーフShinjuku Line Leaf
	"#b6007a",	// 大江戸線ルビーOedo Line Ruby
	"#e5171f",	// 御堂筋線 臙脂Midosuji Line Red
	"#522886",	// 谷町線 京紫Tanimachi Line Purple
	"#0078ba",	// 四つ橋線 縹Yotsubashi Line Blue
	"#019a66",	// 中央線 緑Chuo Line Green
	"#e44d93",	// 千日前線 紅梅Sennichimae Line Pink
	"#814721",	// 堺筋線 マルーンSakaisuji Line Marron
	"#a9cc51",	// 長堀鶴見緑地線 萌黄Nagahoritsurumiryokuchi Line Yellow Green
	"#ee7b1a",	// 今里筋線 柑子Imazatosuji Line Orange
	"#00a0de",	// 南港ポートタウン線 セルリアンブルーNanko port town Line Cerulean Blue
];

export abstract class BaseChart<ScaleT> {
	protected readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	protected width: number;
	protected height: number;
	protected svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	protected svgid: string;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1600;
		this.height = Math.min(this.width, 720) - this.margin.top - this.margin.bottom;
		this.width = this.width - this.margin.left - this.margin.right;

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
	public clear(): void {
		this.svg.selectAll("g").remove();
	}
	public abstract resetScale(scale: ScaleT): void;
	public createDateRange(start: Date, end: Date): string[] {
		const datelist: string[] = [];
		let date: Date = new Date(start.getTime());
		while (date <= end) {
			datelist.push(timeFormat(date));
			date = new Date(date.getTime() + dayMillisecond);
		}
		return datelist;
	}
}
