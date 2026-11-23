import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const BUDGET_CATEGORIES = ['food', 'accommodation', 'local_transport', 'activities'] as const;

@Schema()
export class ActivityImage {
  @Prop({ required: true }) url: string;
  @Prop() filename: string;
}
const ActivityImageSchema = SchemaFactory.createForClass(ActivityImage);

@Schema()
export class Activity {
  @Prop({ required: true }) title: string;
  @Prop() description?: string;
  @Prop() startTime?: string;       // 'HH:mm'
  @Prop() location?: string;
  @Prop({ type: [ActivityImageSchema], default: [] }) images: ActivityImage[];
}
const ActivitySchema = SchemaFactory.createForClass(Activity);

@Schema()
export class BudgetEntry {
  @Prop({ enum: BUDGET_CATEGORIES, required: true }) category: string;
  @Prop({ required: true, min: 0 }) amount: number;
  @Prop({ required: true }) currency: string;
  @Prop() note?: string;
}
const BudgetEntrySchema = SchemaFactory.createForClass(BudgetEntry);

@Schema()
export class ItineraryDay {
  @Prop({ required: true }) dayNumber: number;     // derived
  @Prop({ required: true }) date: Date;            // derived
  @Prop({ required: true }) city: string;
  @Prop({ type: [ActivitySchema], default: [] }) activities: Activity[];
  @Prop({ type: [BudgetEntrySchema], default: [] }) budgets: BudgetEntry[];
}
const ItineraryDaySchema = SchemaFactory.createForClass(ItineraryDay);

@Schema()
export class TransportCost {
  @Prop({ required: true }) fromCity: string;
  @Prop({ required: true }) toCity: string;
  @Prop({ required: true }) mode: string;          // flight, train, bus...
  @Prop({ required: true, min: 0 }) amount: number;
  @Prop({ required: true }) currency: string;
}
const TransportCostSchema = SchemaFactory.createForClass(TransportCost);

@Schema({ timestamps: true })
export class Itinerary {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) ownerId: Types.ObjectId;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true }) country: string;
  @Prop({ required: true }) startDate: Date;
  @Prop({ enum: ['public', 'private'], default: 'private', index: true }) visibility: string;
  @Prop({ default: false, index: true }) isHidden: boolean;            // set by admin HIDE (GEN-10)
  @Prop({ default: false, index: true }) ownerDeactivated: boolean;    // owner deleted account (ACC-12)
  @Prop({ type: [ItineraryDaySchema], default: [] }) days: ItineraryDay[];
  @Prop({ type: [TransportCostSchema], default: [] }) transportCosts: TransportCost[];
  @Prop({ type: Object }) clonedFrom?: { itineraryId: Types.ObjectId; originalTitle: string; authorId: Types.ObjectId };
}
export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);
ItinerarySchema.index({ title: 'text', country: 'text' });
