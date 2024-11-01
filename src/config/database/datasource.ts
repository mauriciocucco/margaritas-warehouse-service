import { DataSource, DataSourceOptions } from 'typeorm';
import typeORMOptions from './typeorm-options';
import * as dotenv from 'dotenv';

dotenv.config(/*{ path: '.env.production' }*/);

//This is for TYPEORM CLI AND MIGRATIONS ONLY!!! It isn't used by Nest
const dataSource = new DataSource(typeORMOptions() as DataSourceOptions);

export default dataSource;
