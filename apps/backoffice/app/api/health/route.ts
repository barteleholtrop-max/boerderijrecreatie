import {durableProblems} from '@/lib/portable/durable';
// Gezondheid voor Cloud Run: 503 als de online opslag ontbreekt (alleen namen van instellingen, nooit waarden).
export async function GET(){
 const problems=durableProblems();
 return Response.json(problems.length?{ok:false,application:'boer-bart-backoffice',problems:problems.map(k=>k+' ontbreekt')}:{ok:true,application:'boer-bart-backoffice'},{status:problems.length?503:200,headers:{'Cache-Control':'no-store'}});
}
