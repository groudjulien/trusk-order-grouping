const path = require('path');
const moment = require('moment');
const jsonfile = require('jsonfile');
jsonfile.spaces = 2;

const orderGenerator = (config) => {
  const randomBetween = (min, max) => Math.random() * (max - min) + min;
  const nSecBetweenDates = moment(config.daterange[1]).unix() - moment(config.daterange[0]).unix();
  const features = Array.from(Array(config.nOrders).keys()).map(i => {
    const startDateSeconds = randomBetween(0, nSecBetweenDates);
    const duration = randomBetween(
      config.durationrange[0],
      config.durationrange[1]
    );
    const startDate = moment(config.daterange[0])
    .add(startDateSeconds, 'seconds');
    const endDate = moment(config.daterange[0])
    .add(startDateSeconds + duration, 'seconds');
    const startlat = parseFloat(randomBetween(config.geoboundaries[1][0], config.geoboundaries[0][0]).toPrecision(8));
    const startlng = parseFloat(randomBetween(config.geoboundaries[1][1], config.geoboundaries[0][1]).toPrecision(8));
    const endlat = parseFloat(randomBetween(config.geoboundaries[1][0], config.geoboundaries[0][0]).toPrecision(8));
    const endlng = parseFloat(randomBetween(config.geoboundaries[1][1], config.geoboundaries[0][1]).toPrecision(8));
    const price = Math.floor(randomBetween(config.pricerange[0], config.pricerange[1]));
    return [{
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [startlng, startlat]
      },
      properties: {
        name: `Course ${i + 1}`,
        type: 'start',
        price: price,
        date: moment(startDate).utc().format(),
      }
    },{
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [startlng, startlat]
      },
      properties: {
        name: `Course ${i + 1}`,
        type: 'end',
        date: moment(endDate).utc().format(),
      }
    }];
  });
  return {
    type: 'FeatureCollection',
    features: features.reduce((arr, f) => [...arr, ...f], [])
  };
};

const ordermap = orderGenerator({
  nOrders: 200, // nombre de courses à générer
  pricerange: [2000, 4000],
  daterange: [
    moment().startOf('day').add(8, 'h'), // date au plus tôt des courses
    moment().startOf('day').add(20, 'h') // date au plus tard des courses
  ],
  geoboundaries: [
    [48.904716, 2.269014], // nord ouest de paris
    [48.80716,2.43014], // sud est de paris
  ],
  durationrange: [15 * 60, 60 * 60] // la course dure de 15 min à 1h
});

jsonfile.writeFile(path.resolve('./orders.json'), ordermap, error => {
  console.log(error || 'Courses générées dans ./orders.json');
});
