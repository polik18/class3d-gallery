export interface User{
 id:string;
 name:string;
 role:'teacher'|'student';
}

export function createGuestUser(name:string):User{
 return {
  id:crypto.randomUUID(),
  name,
  role:'teacher'
 };
}
