export const port = 4080;

export const database = {
  client: 'postgres',
  table: 'flights',
  max_connections: 4,
  connection: {
    database: 'postgres',
    host: 'localhost',
    port: 5432
  }
};

export const views: View[] = [{
  type: '1D',
  name: 'ARR_DELAY',
  title: 'Arrival Delay',
  dimension: 'ARR_DELAY',
  range: [-10, 100],
  bins: 25
}, {
  type: '1D',
  name: 'DISTANCE',
  title: 'Distance',
  dimension: 'DISTANCE',
  range: [50, 2000],
  bins: 25
}, {
  type: '1D',
  name: 'DEP_DELAY',
  title: 'Departure Delay',
  dimension: 'DEP_DELAY',
  range: [-10, 100],
  bins: 25
}, {
  type: '2D',
  name: 'DEP_DELAY_ARR_DELAY',
  title: 'Delay Matrix',
  dimensions: ['DEP_DELAY', 'ARR_DELAY'],
  ranges: [[-10, 100], [-10, 100]],
  bins: [25, 25]
}];

/**
 * Dimensions indexed for easier access.
 */
export const viewIndex: {[dimension: string]: View} = (() => {
  let idx = {};
  views.forEach(d => {
    idx[d.name] = d;
  });
  return idx;
})();

export const optimizations = {
  /**
   * Naive Baseline. Enable this to remove all
   * optimizations, used for testing the baseline.
   * If you turn this on, all the other optimization
   * flags are ignored.
   */
  naiveBaseline: true,
  /**
   * Start preloading when the page is first loaded.
   */
  startOnPageload: true,
  /**
   * Preload data.
   */
  preload: true,
  /**
   * Enable compression for the websocket connection.
   */
  compression: true,
  /**
   * Snap to the closest cache.
   */
  snapping: true,
  /**
   * Use prepared statements in the database.
   */
  preparedStatements: false,
  /**
   * Preload resolution - when preloading, how much space
   * do we want to provide between cachepoints by default?
   */
  preloadResolution: resolution => resolution / 200
};

export const debugging = {
  /**
   * Log api calls in the client.
   */
  logApi: true,

  /**
   * Show visualization of the cache state.
   */
  visualizeCache: true
};
