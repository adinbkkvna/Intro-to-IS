const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`Gym Booking System is running at http://localhost:${config.port}`);
});
