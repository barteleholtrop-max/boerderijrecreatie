import os,subprocess,secrets,base64,urllib.request,urllib.error,json,time,pathlib,hashlib,hmac,uuid
import tempfile
root=pathlib.Path(__file__).resolve().parents[1];tests=pathlib.Path(tempfile.mkdtemp(prefix='boer-bart-smoke-'))
# Inloggen zoals live (besluit eigenaar 6 november 2026): een ondertekende sessie na de Authenticator-code, gedeeld door
# backoffice en planbord (tools/auth/sessie.mjs). Supabase zelf is hier niet nodig: de sessie is al ondertekend.
secret=secrets.token_urlsafe(36);children={};logs={}
def b64(b):return base64.urlsafe_b64encode(b).decode().rstrip('=')
_now=int(time.time()*1000);_body=b64(json.dumps({'email':'test-owner@boerbart.nl','name':'test-owner','role':'eigenaar','exp':_now+8*3600000,'mfa':_now}).encode())
auth='bb_sessie='+_body+'.'+b64(hmac.new(secret.encode(),_body.encode(),hashlib.sha256).digest())
def start(name,port):
 env={k:v for k,v in os.environ.items() if not k.startswith(('CODEX','SITES','OPENAI','OAI_'))}
 # The login is checked as it will be when going live (BOER_BART_LOGIN=aan); while developing it is off by default.
 env.update(BOER_BART_LOGIN='aan',AUTH_SECRET=secret,SUPABASE_URL='http://127.0.0.1:9',SUPABASE_ANON_KEY='anon-test',APP_DATA_DIR=str(tests/name),APP_ORIGIN='http://127.0.0.1:'+str(port),PORT=str(port),NEXT_TELEMETRY_DISABLED='1')
 logs[name]=open(tests/(name+'.log'),'w')
 children[name]=subprocess.Popen(['node','../../tools/start-app.mjs'],cwd=root/'apps'/name,env=env,stdout=logs[name],stderr=subprocess.STDOUT)
 for i in range(80):
  try:
   with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/api/health',timeout=2) as r:
    if r.status==200:return
  except:time.sleep(.2)
 raise RuntimeError(name+' did not start')
def call(port,path,body=None,method=None,authorized=True,origin=True,raw=False):
 h={'Cookie':auth} if authorized else {}
 if body is not None:h['Content-Type']='application/json'
 if origin:h['Origin']='http://127.0.0.1:'+str(port) if origin is True else origin
 req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:
   b=r.read();return r.status,b if raw else json.loads(b)
 except urllib.error.HTTPError as e:
  b=e.read()
  try:b=json.loads(b)
  except:b=b.decode()[:300]
  return e.code,b
report={'runtime':subprocess.check_output(['node','--version'],text=True).strip(),'checks':[]}
def check(label,condition):
 if not condition:raise AssertionError(label)
 report['checks'].append(label)
try:
 start('planbord',4321);start('backoffice',4322)
 check('Planbord zonder aanmelding beschermd',call(4321,'/api/board',authorized=False)[0]==401)
 expected=json.loads((root/'data/planbord/current.json').read_text())
 code,b=call(4321,'/api/board');check('Alle huidige bordgegevens exact behouden',code==200 and b==expected)
 check('Procesflow en onderwerpen starten',all(call(4321,p,raw=True)[0]==200 for p in ['/','/onderwerpen']))
 changed=json.loads(json.dumps(b));changed['board']['nodes'][0]['notes']+='\\nStandalone export test'
 code,saved=call(4321,'/api/board',changed,'PUT');check('Bord opslaan werkt lokaal',code==200 and saved['revision']==b['revision']+1)
 check('Oude revisie wordt geweigerd',call(4321,'/api/board',changed,'PUT')[0]==409)
 check('Verkeerde Origin wordt geweigerd',call(4321,'/api/board',changed,'PUT',origin='https://untrusted.invalid')[0]==403)
 children['planbord'].terminate();children['planbord'].wait();logs['planbord'].close();start('planbord',4321)
 persisted=call(4321,'/api/board')[1];check('Opslag blijft na herstart bestaan',persisted['revision']==saved['revision'])
 check('Backoffice zonder aanmelding beschermd',call(4322,'/api/products',authorized=False)[0]==401)
 code,p=call(4322,'/api/products');exp=json.loads((root/'data/backoffice/products-api.json').read_text())
 # „supplier” (geleverd door, 8 november 2026) is afgeleid uit product_owners, geen productgegeven: niet meevergelijken.
 if code==200:p=[{k:v for k,v in x.items() if k!='supplier'} for x in p]
 check('Alle producten, concepten en publicaties behouden',code==200 and sorted(p,key=lambda x:x['id'])==sorted(exp,key=lambda x:x['id']))
 for m in json.loads((root/'data/backoffice/media-manifest.json').read_text()):
  # Het origineel blijft byte voor byte bewaard (?origineel=1). Het gewone adres geeft sinds 13 november 2026 de lichte
  # webversie (lib/web-photo.ts): die moet een werkende afbeelding zijn.
  code,blob=call(4322,'/api/media/'+m['id']+'?origineel=1',raw=True)
  check('Beeld intact '+m['id'],code==200 and hashlib.sha256(blob).hexdigest()==m['sha256'])
  code,web=call(4322,'/api/media/'+m['id'],raw=True)
  check('Webversie werkt '+m['id'],code==200 and len(web)>0 and (web[:2]==b'\xff\xd8' or web[:4]==b'\x89PNG' or web[8:12]==b'WEBP' or web[:3]==b'GIF'))
 product=p[0];draft=product['draft'].copy();draft['note']+=' standalone test'
 check('Product lokaal opslaan zonder Google of Work',call(4322,'/api/products',{'action':'save','id':product['id'],'version':product['version'],'product':draft},'POST')[0]==200)
 check('Google-sleutel niet gekopieerd',call(4322,'/api/sheets')[1]['connected'] is False)
 code,state=call(4322,'/api/operations');check('Voorraad/recepten API start',code==200)
 version=state['version'];today=state['today'];iid=str(uuid.uuid4())
 def mutate(body):
  global version
  body={**body,'version':version,'requestId':str(uuid.uuid4())}
  c,d=call(4322,'/api/operations',body,'POST')
  if c!=200:raise RuntimeError(str((body['action'],c,d)))
  version=call(4322,'/api/operations')[1]['version']
  return body,d
 mutate({'action':'ingredient','ingredient':{'id':iid,'name':'Export test flour','unit':'kg','supplier':'Test','article':'T1','stock':0,'known':False,'countedAt':'','pack':5,'min':1,'leadDays':1,'shelfDays':60,'allergens':['Gluten'],'checked':True,'notes':''}})
 mutate({'action':'count','ingredientId':iid,'quantity':0,'date':today})
 inv={'id':str(uuid.uuid4()),'supplier':'Test','number':'EXPORT-TEST','date':today,'source':'Only isolated test database','reviewed':False,'lines':[{'id':'l1','article':'T1','description':'Flour','quantity':10,'unit':'kg','netCents':2000,'ingredientId':iid,'kind':'product','received':False}]}
 mutate({'action':'invoice','invoice':inv})
 getstock=lambda:next(i['stock'] for i in call(4322,'/api/operations')[1]['state']['ingredients'] if i['id']==iid)
 check('Factuur alleen verhoogt voorraad niet',getstock()==0)
 received,_=mutate({'action':'receive','invoiceId':inv['id'],'date':today,'allocations':[{'lineId':'l1','quantity':10,'orderId':''}]})
 check('Ontvangst verhoogt voorraad eenmaal',getstock()==10)
 check('Dubbele aanvraag is idempotent',call(4322,'/api/operations',received,'POST')[1].get('duplicate') is True and getstock()==10)
 mutate({'action':'recipe','recipe':{'productId':product['id'],'name':'Export test recipe','yield':10,'lines':[{'ingredientId':iid,'quantity':2}],'lossPct':0,'packagingCents':25,'method':'Isolated test','version':0,'reviewed':True}})
 mutate({'action':'consume-recipe','productId':product['id'],'portions':10,'note':'Export-smoke-test','kind':'verspilling'})
 check('Receptverbruik verlaagt voorraad',getstock()==8)
 code,plan=call(4322,'/api/operations',{'action':'plan','demand':[{'productId':product['id'],'portions':50}],'due':today},'POST')
 check('Weekvoorstel rekent verpakking correct',code==200 and plan['plan']['lines'][0]['quantity']==5)
 report['success']=True;report['boardRevision']=expected['revision'];report['products']=len(p);report['media']=len(json.loads((root/'data/backoffice/media-manifest.json').read_text()))
except Exception as e:report['success']=False;report['error']=str(e);raise
finally:
 for proc in children.values():
  if proc.poll() is None:proc.terminate();proc.wait()
 for f in logs.values():
  if not f.closed:f.close()
 (tests/'smoke-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False))
