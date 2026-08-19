import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";

export function renewalWindow(start:Date,durationDays:number,currentEnd?:Date|null){
  const requested=startOfDay(start); const effectiveStart=currentEnd&&currentEnd>requested?startOfDay(currentEnd):requested;
  return {startsAt:effectiveStart,endsAt:addDays(effectiveStart,durationDays)};
}
export function freezeDays(start:Date,end:Date){return Math.max(1,differenceInCalendarDays(startOfDay(end),startOfDay(start)));}
export function finalPrice(basePrice:number,discount:number){const total=Math.round((basePrice-Math.min(Math.max(discount,0),basePrice))*100)/100;return Math.max(0,total)}
export function invoiceStatus(total:number,paid:number){if(paid<=0)return "unpaid" as const;if(paid>=total)return "paid" as const;return "partially_paid" as const}
