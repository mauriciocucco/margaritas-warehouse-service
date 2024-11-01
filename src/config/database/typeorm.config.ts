import { registerAs } from '@nestjs/config';
import typeORMOptions from './typeorm-options';

export default registerAs('typeorm', typeORMOptions);
