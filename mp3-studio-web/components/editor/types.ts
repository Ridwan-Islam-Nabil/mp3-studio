import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";

/** WaveSurfer's region object (what `RegionsPlugin.addRegion()` returns). */
export type WsRegion = ReturnType<RegionsPlugin["addRegion"]>;

/** A cut region as plain data — what history snapshots store. Times in seconds. */
export interface RegionData {
  id: string;
  start: number;
  end: number;
}

/** A cut region in editor state: the data plus the live WaveSurfer region. */
export interface Region extends RegionData {
  wsRef: WsRegion;
}
