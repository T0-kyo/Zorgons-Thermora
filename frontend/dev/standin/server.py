# Stand-in for the team backend: the same SQL (DuckDB) and the same JSON shapes as
# Backend/api/Repositories/DataRepository.cs (contract of 9c99e89, with the open bugs FIXED:
# all-country reads work, underscore ids match), on synthetic data from makedata.py.
# Env: WAKE=<s> simulates a sleeping container (MODE=503 → replies 503 while waking, else holds requests).
import json, duckdb, time, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
import os
_D=os.path.join(os.path.dirname(os.path.abspath(__file__)),"data")
E=os.path.join(_D,"harmonized_data.parquet"); S=os.path.join(_D,"fire_level_assessment.parquet")
def q(sql, params):
    con=duckdb.connect(); cur=con.execute(sql, params); cols=[d[0] for d in cur.description]; return [dict(zip(cols,r)) for r in cur.fetchall()]
HAV="""AND (6371 * 2 * ASIN(SQRT(POWER(SIN((RADIANS({t}latitude) - RADIANS(?)) / 2), 2) + COS(RADIANS(?)) * COS(RADIANS({t}latitude)) * POWER(SIN((RADIANS({t}longitude) - RADIANS(?)) / 2), 2))) <= ?)"""
def spatial(qs, t=""):
    if qs.get("region"): return "AND "+t+"country = ?", [qs["region"]]
    if qs.get("lat") and qs.get("lng"):
        la=float(qs["lat"]); lo=float(qs["lng"]); r=float(qs.get("radiusKm",150)); return HAV.format(t=t), [la,la,lo,r]
    return None, None
nd=lambda v: None if v is None else float(v)
def toint(v):
    if v is None: raise ValueError("Object cannot be cast from DBNull to other types.")  # Convert.ToInt32(DBNull)
    return int(v)
CONF="""COALESCE(SUM(CASE WHEN s.confidence_level = 'Low' THEN 1 ELSE 0 END),0) AS ConfLow,
        COALESCE(SUM(CASE WHEN s.confidence_level = 'Medium' THEN 1 ELSE 0 END),0) AS ConfMed,
        COALESCE(SUM(CASE WHEN s.confidence_level = 'High' THEN 1 ELSE 0 END),0) AS ConfHigh"""
def summary(where, params, weekday):
    wk = "".join(f", COUNT(CASE WHEN EXTRACT(dow FROM e.date) = {i} THEN 1 END) AS D{i}" for i in range(7)) if weekday else ""
    r=q(f"""SELECT SUM(e.modis_detections) AS FiresLegacy, SUM(e.n_detections) AS FiresHarmonized,
        AVG(s.human_association_score) AS H, AVG(s.ci_lower) AS L, AVG(s.ci_upper) AS U, COUNT(s.fire_id) AS ScoredFires, {CONF} {wk}
        FROM read_parquet('{E}') e LEFT JOIN read_parquet('{S}') s ON e.fire_id = s.fire_id WHERE {where}""",params)[0]
    leg=int(r["FiresLegacy"] or 0); har=int(r["FiresHarmonized"] or 0)
    return {"undercountPct":round((har-leg)/leg*100,1) if leg else 0,"firesLegacy":leg,"firesHarmonized":har,
        "weekdayCounts":[float(r[f"D{i}"]) for i in range(7)] if weekday else [0.0]*7,
        "humanScoreLegacy":None,"humanScoreHarmonized":nd(r["H"]),"humanScoreLow":nd(r["L"]),"humanScoreHigh":nd(r["U"]),
        "confidence":{"low":toint(r["ConfLow"]),"medium":toint(r["ConfMed"]),"high":toint(r["ConfHigh"])},
        "scoredFires":int(r["ScoredFires"]),"totalFires":har}
START=time.time(); WAKE=float(os.environ.get('WAKE','0')); FIRSTQ={'done':False}
class H(BaseHTTPRequestHandler):
    def send(self, code, body):
        b=json.dumps(body, default=str).encode(); self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        wait=WAKE-(time.time()-START)
        if wait>0 and os.environ.get('MODE')=='503': return self.send(503,{'title':'starting'})
        if wait>0: time.sleep(wait)
        u=urlparse(self.path); p=unquote(u.path); qs={k:v[0] for k,v in parse_qs(u.query).items()}
        if p.startswith('/api/') and not FIRSTQ['done']:
            FIRSTQ['done']=True; time.sleep(25)
        if p=="/health": return self.send(200,{"status":"Healthy"})
        try:
            if p=="/api/cells":
                f="AND e.country = ?" if qs.get("regionId") else ""
                rows=q(f"""SELECT ROUND(e.latitude * 2) / 2 AS Lat, ROUND(e.longitude * 2) / 2 AS Lng, e.country AS RegionId,
                    SUM(e.modis_detections) AS Legacy, SUM(e.n_detections) AS Harmonized, AVG(s.human_association_score) AS Human,
                    AVG(s.ci_lower) AS HumanLow, AVG(s.ci_upper) AS HumanHigh, MODE(s.confidence_level) AS Confidence, COUNT(s.fire_id) AS ScoredFires
                    FROM read_parquet('{E}') e LEFT JOIN read_parquet('{S}') s ON e.fire_id = s.fire_id
                    WHERE EXTRACT(YEAR FROM e.date) = ? {f}
                    GROUP BY ROUND(e.latitude * 2) / 2, ROUND(e.longitude * 2) / 2, e.country ORDER BY Harmonized DESC LIMIT 3000""",
                    [int(qs["year"])]+([qs["regionId"]] if qs.get("regionId") else []))
                return self.send(200,[{"lat":float(r["Lat"]),"lng":float(r["Lng"]),"regionId":r["RegionId"],"legacy":int(r["Legacy"]),"harmonized":int(r["Harmonized"]),
                    "human":nd(r["Human"]),"humanLow":nd(r["HumanLow"]),"humanHigh":nd(r["HumanHigh"]),"confidence":r["Confidence"],"scoredFires":int(r["ScoredFires"])} for r in rows])
            if p.startswith("/api/countries/") and p.endswith("/summary"):
                cid=p[len("/api/countries/"):-len("/summary")].replace("_"," ")
                out=summary("e.country = ? AND EXTRACT(YEAR FROM e.date) = ?", [cid,int(qs.get("year",2023))], True)
                out["totalFires"]=q(f"SELECT COUNT(*) AS n FROM read_parquet('{E}') e WHERE e.country = ? AND EXTRACT(YEAR FROM e.date) = ?",[cid,int(qs.get("year",2023))])[0]["n"]
                import random; random.seed(cid)
                base=random.randint(20000,1500000); ser=[{"year":y,"count":int(base*(1+random.uniform(-0.15,0.15)))} for y in range(2018,2025)]
                sig=random.random()<0.4
                out["trend"]={"series":ser,"slope":round(random.uniform(-0.05,0.05)*base,1),"direction":("Increasing" if random.random()<0.5 else "Decreasing") if sig else "No Significant Trend",
                    "significance":"Statistically Significant" if sig else "Not Statistically Significant","pValue":round(random.uniform(0.001,0.04) if sig else random.uniform(0.06,0.6),4)}
                return self.send(200, out)
            if p=="/api/summary":
                return self.send(200, summary("EXTRACT(YEAR FROM e.date) = ?", [int(qs.get("year",2023))], False))
            if p=="/api/progress":
                f,ps=spatial(qs,"e.")
                empty={"series":[],"baseline":0,"recent":0,"changePct":0,"direction":"stable","humanLikelihood":{"legacy":None,"harmonized":None,"low":None,"high":None,"confidence":{"low":0,"medium":0,"high":0},"scoredFires":0},"covered":False}
                if f is None: return self.send(200, empty)
                ps=[x.replace("_"," ") if isinstance(x,str) else x for x in ps]
                series=q(f"""SELECT EXTRACT(YEAR FROM e.date) AS Year, SUM(e.modis_detections) AS Legacy, SUM(e.n_detections) AS Harmonized
                    FROM read_parquet('{E}') e WHERE 1=1 {f} GROUP BY EXTRACT(YEAR FROM e.date) ORDER BY Year ASC""",ps)
                if not series: return self.send(200, empty)
                h=q(f"""SELECT AVG(s.human_association_score) AS H, AVG(s.ci_lower) AS L, AVG(s.ci_upper) AS U, COUNT(s.fire_id) AS N, {CONF}
                    FROM read_parquet('{E}') e LEFT JOIN read_parquet('{S}') s ON e.fire_id = s.fire_id WHERE 1=1 {f}""",ps)[0]
                hv=[int(x["Harmonized"]) for x in series]; b=sum(hv[:3])/len(hv[:3]); rc=sum(hv[-3:])/len(hv[-3:]); ch=(rc-b)/b*100 if b else 0
                return self.send(200,{"series":[{"year":int(x["Year"]),"legacy":int(x["Legacy"]),"harmonized":int(x["Harmonized"])} for x in series],
                    "baseline":round(b,1),"recent":round(rc,1),"changePct":round(ch,1),"direction":"worse" if ch>10 else "better" if ch<-10 else "stable",
                    "humanLikelihood":{"legacy":None,"harmonized":nd(h["H"]),"low":nd(h["L"]),"high":nd(h["U"]),
                        "confidence":{"low":toint(h["ConfLow"]),"medium":toint(h["ConfMed"]),"high":toint(h["ConfHigh"])},"scoredFires":int(h["N"])},"covered":True})
            if p=="/api/daily":
                f,ps=spatial(qs)
                if f is None: return self.send(200,[])
                ps=[x.replace("_"," ") if isinstance(x,str) else x for x in ps]
                rows=q(f"""SELECT CAST(date AS VARCHAR) AS Date, SUM(modis_detections) AS Legacy, SUM(n_detections) AS Harmonized
                    FROM read_parquet('{E}') WHERE EXTRACT(YEAR FROM date) = ? {f} GROUP BY date ORDER BY date ASC""",[int(qs["year"])]+ps)
                return self.send(200,[{"date":r["Date"],"legacy":int(r["Legacy"]),"harmonized":int(r["Harmonized"])} for r in rows])
            if p=="/api/countries":
                return self.send(200,[{"id":"Angola","name":"Angola"},{"id":"China","name":"China"},{"id":"Egypt","name":"Egypt"},{"id":"Greece","name":"Greece"},
                    {"id":"Oman","name":"Oman"},{"id":"United_Kingdom","name":"United Kingdom"},{"id":"United_States","name":"United States of America"},{"id":"Yemen","name":"Yemen"}])
            if p=="/api/meta":
                r=q(f"SELECT CAST(MIN(date) AS VARCHAR) AS MinDate, CAST(MAX(date) AS VARCHAR) AS MaxDate, COUNT(*) AS T FROM read_parquet('{E}')",[])[0]
                return self.send(200,{"minDate":r["MinDate"],"maxDate":r["MaxDate"],"totalDetections":int(r["T"])})
            return self.send(404,{"title":"Not Found"})
        except Exception as ex:
            return self.send(500,{"title":"error","detail":str(ex)})
    def log_message(self,*a): pass
ThreadingHTTPServer(("127.0.0.1",5098),H).serve_forever()
