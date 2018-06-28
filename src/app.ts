import { BaseType, extent, select, Selection } from "d3";
import ndarray from "ndarray";
import { changeset, truthy, View as VgView } from "vega-lib";
import { DataBase } from "./db";
import { Logger } from "./logger";
import {
  bin,
  binNumberFunction,
  binToData,
  clamp,
  diff,
  is1DView,
  omit,
  stepSize
} from "./util";
import {
  createHeatmapView,
  createHistogramView,
  HISTOGRAM_WIDTH
} from "./view";

export class App<V extends string, D extends string> {
  private activeView: V;
  private vegaViews = new Map<V, VgView>();
  private brushes = new Map<D, Interval<number>>();
  private data: Map<V, ndarray>;
  private needsUpdate = false;

  /**
   * Construct the app
   * @param el The element.
   * @param views The views.
   * @param order The order of views.
   * @param db The database to query.
   * @param logger An optional logger to collect traces.
   */
  public constructor(
    private readonly el: Selection<BaseType, {}, HTMLElement, any>,
    private readonly views: Views<V, D>,
    order: V[],
    private db: DataBase<V, D>,
    private logger?: Logger<V>
  ) {
    // this.activeView = views[0].name;
    this.initialize(order);
  }

  private initialize(order: V[]) {
    const self = this;
    this.el
      .attr("class", "app")
      .selectAll(".view")
      .data(order)
      .enter()
      .append("div")
      .attr("class", "view")
      .each(function(name: V) {
        const view = self.views.get(name)!;
        const el = select(this).node() as Element;
        if (is1DView(view)) {
          const binConfig = bin({
            maxbins: view.dimension.bins,
            extent: view.dimension.extent
          });
          view.dimension.binConfig = binConfig;

          const vegaView = createHistogramView(el, view);
          self.vegaViews.set(name, vegaView);

          const data = self.db.histogram(view.dimension);
          self.update1DView(name, view, data);

          vegaView.addSignalListener("brush", (_name, value) => {
            self.brushMove(name, view.dimension.name, value);
          });

          vegaView.addEventListener("mouseover", () => {
            if (self.activeView !== name) {
              self.switchActiveView(name);
            }
          });

          if (self.logger) {
            self.logger.attach(name, vegaView);
          }
        } else {
          for (const dimension of view.dimensions) {
            const binConfig = bin({
              maxbins: dimension.bins,
              extent: dimension.extent
            });
            dimension.binConfig = binConfig;
          }

          const vegaView = createHeatmapView(el, view);
          self.vegaViews.set(name, vegaView);

          const data = self.db.heatmap(view.dimensions);
          self.update2DView(name, view, data);
        }
      });
  }

  private switchActiveView(name: V) {
    console.log(`Active view ${this.activeView} => ${name}`);

    if (this.activeView) {
      this.vegaViews.get(this.activeView)!.runAfter(view => {
        view.signal("active", false).run();
      });
    }

    this.activeView = name;

    const activeView = this.getActiveView();

    const brushes = new Map(this.brushes);
    if (is1DView(activeView)) {
      brushes.delete(activeView.dimension.name);
    }

    this.data = this.db.loadData(
      activeView,
      HISTOGRAM_WIDTH,
      omit(this.views, name),
      brushes
    );

    const activeVgView = this.vegaViews.get(name)!;
    activeVgView.runAfter(view => {
      view.signal("active", true).run();
    });

    // activeVgView.change(
    //   "interesting",
    //   changeset()
    //     .remove(truthy)
    //     .insert(this.calculateInterestingness())
    // );
  }

  // private calculateInterestingness() {
  //   let out: {
  //     view: V;
  //     x: number;
  //     value: any;
  //   }[] = [];

  //   for (const [name, view] of omit(this.views, this.activeView)) {
  //     if (is1DView(view)) {
  //       const data = range(HISTOGRAM_WIDTH - 1).map(pixel => {
  //         const distance = diff(
  //           this.getResult(name, pixel),
  //           this.getResult(name, pixel + 1)
  //         ).reduce((acc, val) => acc + Math.abs(val), 0);
  //         return {
  //           view: name,
  //           x: pixel,
  //           value: distance
  //         };
  //       });
  //       out = out.concat(data);
  //     } else {
  //       // TODO
  //     }
  //   }

  //   return out;
  // }

  private brushMove(name: V, dimension: D, value: [number, number]) {
    if (this.activeView !== name) {
      this.switchActiveView(name);
    }

    // delete or set brush
    if (!value) {
      this.brushes.delete(dimension);
    } else {
      this.brushes.set(dimension, extent(value) as [number, number]);
    }

    this.needsUpdate = true;
    window.requestAnimationFrame(() => {
      this.update();
    });
  }

  private getActiveView() {
    return this.views.get(this.activeView)! as View1D<D>;
  }

  private update1DView(name: V, view: View1D<D>, hist: ndarray) {
    const unbin = binToData(view.dimension.binConfig!);

    const data = new Array(hist.size);

    for (let x = 0; x < hist.shape[0]; x++) {
      data[x] = {
        key: unbin(x),
        value: hist.get(x)
      };
    }

    this.updateView(name, data);
  }

  private update2DView(name: V, view: View2D<D>, heat: ndarray) {
    const binConfigs = view.dimensions.map(d => d.binConfig!);
    const [binToDataX, binToDataY] = binConfigs.map(binToData);

    const data = new Array(heat.size);

    let i = 0;
    for (let x = 0; x < heat.shape[0]; x++) {
      for (let y = 0; y < heat.shape[1]; y++) {
        data[i++] = {
          keyX: binToDataX(x),
          keyY: binToDataY(y),
          value: heat.get(x, y)
        };
      }
    }

    this.updateView(name, data);
  }

  private updateView<T>(name: V, data: T[]) {
    const changeSet = changeset()
      .remove(truthy)
      .insert(data);
    const vgView = this.vegaViews.get(name)!;
    vgView.runAfter(() => {
      vgView.change("table", changeSet).run();
    });
  }

  private update() {
    if (!this.needsUpdate) {
      console.info("Skipped update");
      return;
    }

    this.needsUpdate = false;

    const activeView = this.getActiveView();
    const activeBinF = binNumberFunction({
      start: activeView.dimension.extent[0],
      step: stepSize(activeView.dimension.extent, HISTOGRAM_WIDTH)
    });

    const brush = this.brushes.get(activeView.dimension.name);

    let activeBrush: number[] | null = null;

    if (brush) {
      // active brush in pixel domain
      activeBrush = brush.map(b =>
        clamp(activeBinF(b), [0, HISTOGRAM_WIDTH - 1])
      );
    }

    for (const [name, view] of this.views) {
      if (name === this.activeView) {
        continue;
      }

      const hists = this.data.get(name)!;

      if (is1DView(view)) {
        const hist = activeBrush
          ? diff(
              hists.pick(activeBrush[0], null),
              hists.pick(activeBrush[1], null)
            )
          : hists.pick(HISTOGRAM_WIDTH, null);

        this.update1DView(name, view, hist);
      } else {
        const heat = activeBrush
          ? diff(
              hists.pick(activeBrush[0], null, null),
              hists.pick(activeBrush[1], null, null)
            )
          : hists.pick(HISTOGRAM_WIDTH, null, null);

        this.update2DView(name, view, heat);
      }
    }
  }
}
