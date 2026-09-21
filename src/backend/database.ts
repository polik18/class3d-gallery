export interface CloudRecord{
 id:string;
 type:string;
 data:any;
 updatedAt:number;
}

export async function syncRecord(record:CloudRecord){
 // Placeholder for Firebase / Supabase adapter
 return {
  synced:true,
  record
 };
}
