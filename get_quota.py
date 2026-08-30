from google_auth_oauthlib.flow import InstalledAppFlow
import requests, json

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
PROJECT_NUMBER = "744155115870"

flow = InstalledAppFlow.from_client_secrets_file("oauth_client.json", SCOPES)
credentials = flow.run_local_server(port=0)

url = f"https://serviceusage.googleapis.com/v1beta1/projects/{PROJECT_NUMBER}/services/generativelanguage.googleapis.com/consumerQuotaMetrics"

r = requests.get(url, headers={"Authorization": f"Bearer {credentials.token}"})

print("HTTP:", r.status_code)

if r.ok:
    data = r.json()
    with open("quota.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("quota.json créé")
else:
    print(r.text)
