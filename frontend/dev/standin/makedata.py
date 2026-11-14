import duckdb, random, datetime, math, os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),"data"); os.makedirs(D, exist_ok=True)
random.seed(7)
C={"Angola":(-12.3,17.5,0.72,5,4),"China":(31,113,0.86,4,6),"Egypt":(30.9,31.0,0.91,0.6,0.8),"Greece":(39.3,22.6,0.5,1.2,1.6),
   "United Kingdom":(53,-1.5,0.62,1.5,1.5),"United States":(39,-110,0.32,6,10),"Yemen":(15.5,47.5,0.42,2,3)}
eng=[]; sci=[]; fid=0
for y in range(2020,2025):
  for c,(la,lo,h,sla,slo) in C.items():
    n = 1800 if c in ("Angola","China","United States") else 600
    for i in range(n):
      d=datetime.date(y,1,1)+datetime.timedelta(days=random.randint(0,364))
      wd=d.weekday()
      if wd>=5 and random.random()<h*0.35: continue  # human fires dip at weekends
      fid+=1; m=random.randint(0,2); nd=m+random.randint(0,2)
      eng.append((fid,round(la+random.gauss(0,sla),4),round(lo+random.gauss(0,slo),4),c,d,m,nd))
      if random.random()<0.85: sci.append((fid,round(min(1,max(0,random.gauss(h,0.12))),3)))
con=duckdb.connect()
con.execute("create table e(fire_id int, latitude double, longitude double, country varchar, date date, modis_detections int, n_detections int)")
con.executemany("insert into e values (?,?,?,?,?,?,?)",eng)
con.execute("create table s(fire_id int, human_association_score double)")
con.executemany("insert into s values (?,?)",sci)
con.execute(f"copy e to '{D}/harmonized_data.parquet' (format parquet)")

print("fires:",len(eng),"scored:",len(sci))

# science table with the columns of the real fire_level_assessment.parquet
H={"Angola":0.72,"China":0.86,"Egypt":0.91,"Greece":0.5,"United Kingdom":0.62,"United States":0.32,"Yemen":0.42}
rows=con.execute(f"select fire_id, country from read_parquet('{D}/harmonized_data.parquet')").fetchall()
out=[]
for fid,c in rows:
    if random.random()>0.85: continue  # not every fire is scored
    sc=min(1,max(0,random.gauss(H[c],0.12))); w=random.uniform(0.03,0.15)
    lvl=random.choices(["High","Medium","Low"],[0.6,0.3,0.1])[0]
    out.append((fid,round(sc,3),"High" if sc>=0.66 else "Medium" if sc>=0.4 else "Low",round(max(0,sc-w),3),round(min(1,sc+w),3),round(random.random(),2),lvl))
con.execute("create table s2(fire_id int, human_association_score double, human_association_level varchar, ci_lower double, ci_upper double, confidence_score double, confidence_level varchar)")
con.executemany("insert into s2 values (?,?,?,?,?,?,?)",out)
con.execute(f"copy s2 to '{D}/fire_level_assessment.parquet' (format parquet)")
print("scored", len(out))
