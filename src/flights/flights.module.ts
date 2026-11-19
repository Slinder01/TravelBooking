import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Flight, FlightSchema } from './schemas/flight.schema';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';
import { AirlinesModule } from '../airlines/airlines.module';
import { AirportsModule } from '../airports/airports.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Flight.name, schema: FlightSchema }]),
    AirlinesModule,
    AirportsModule,
  ],
  controllers: [FlightsController],
  providers: [FlightsService],
  exports: [MongooseModule, FlightsService],
})
export class FlightsModule {}
