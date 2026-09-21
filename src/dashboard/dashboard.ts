export interface DashboardStats{
 classes:number;
 students:number;
 artworks:number;
}

export function calculateDashboard(records:any[]):DashboardStats{
 return {
  classes:records.filter(x=>x.type==='class').length,
  students:records.filter(x=>x.type==='student').length,
  artworks:records.filter(x=>x.type==='artwork').length
 };
}
