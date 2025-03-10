import { DynamicModule, Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from 'src/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/User.entity';
import { StripeWebHookController } from './webhook/stripeWebHook.controller';
import { Category } from 'src/category/entities/category.entity';
import { Postulation } from 'src/postulations/entities/postulation.entity';
import { Job } from 'src/jobs/entities/job.entity';

@Module({})
export class SubscriptionsModule {
  static forRootAsync(): DynamicModule {
    return {
      module: SubscriptionsModule,
      controllers: [SubscriptionsController, StripeWebHookController],
      imports: [
        ConfigModule.forRoot(),
        UserModule,
        TypeOrmModule.forFeature([User, Category, Postulation, Job]),
      ],
      providers: [
        SubscriptionsService,
        {
          provide: 'STRIPE_API_KEY',
          useFactory: async (configService: ConfigService) =>
            configService.get('STRIPE_API_KEY'),
          inject: [ConfigService],
        },
      ],
    };
  }
}
