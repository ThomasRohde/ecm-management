import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StructuralOpsModule } from '../structural-ops/structural-ops.module';
import { VersioningModule } from '../versioning/versioning.module';
import { DownstreamConsumerController } from './downstream-consumer.controller';
import { DownstreamConsumerService } from './downstream-consumer.service';
import { PublishedModelController } from './published-model.controller';
import {
  DownstreamConsumerPublishEventDeliveryClient,
  NoopPublishEventDeliveryClient,
  PublishEventDeliveryClient,
} from './publish-event-delivery.client';
import { PublishEventDeliveryWorkerService } from './publish-event-delivery-worker.service';
import { PublishedModelService } from './published-model.service';
import { PublishEventListenerService } from './publish-event-listener.service';
import { PublishEventService } from './publish-event.service';
import { TransformationProfileService } from './transformation-profile.service';

@Module({
  imports: [forwardRef(() => VersioningModule), StructuralOpsModule, AuditModule],
  controllers: [PublishedModelController, DownstreamConsumerController],
  providers: [
    PublishedModelService,
    DownstreamConsumerService,
    TransformationProfileService,
    PublishEventService,
    PublishEventListenerService,
    PublishEventDeliveryWorkerService,
    NoopPublishEventDeliveryClient,
    DownstreamConsumerPublishEventDeliveryClient,
    {
      provide: PublishEventDeliveryClient,
      useExisting: DownstreamConsumerPublishEventDeliveryClient,
    },
  ],
  exports: [
    PublishedModelService,
    DownstreamConsumerService,
    PublishEventService,
    PublishEventDeliveryWorkerService,
    TransformationProfileService,
  ],
})
export class IntegrationModule {}
