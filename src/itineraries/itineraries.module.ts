import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema';
import { ItinerariesService } from './itineraries.service';
import { ItinerariesController } from './itineraries.controller';
import { ActivitiesController } from './activities.controller';
import { FxService } from './fx.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Itinerary.name, schema: ItinerarySchema }])],
  controllers: [ItinerariesController, ActivitiesController],
  providers: [ItinerariesService, FxService],
  exports: [ItinerariesService, FxService],
})
export class ItinerariesModule {}
