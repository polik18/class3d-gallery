export interface StudentProfile{
 seat:string;
 name:string;
 works:string[];
 evaluations:string[];
}

export function createProfile(
 seat:string,
 name:string
):StudentProfile{
 return {
  seat,
  name,
  works:[],
  evaluations:[]
 };
}
