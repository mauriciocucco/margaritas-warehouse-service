import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiGatewayGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest();
    const apiGatewayKey =
      request.headers[this.configService.get('API_GATEWAY_HEADER')];

    return apiGatewayKey === this.configService.get('API_GATEWAY_KEY');
  }
}
