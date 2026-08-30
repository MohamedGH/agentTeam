from google_auth_oauthlib.flow import InstalledAppFlow
import requests

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

PROJECT_NUMBER = "744155115870"

flow = InstalledAppFlow.from_client_secrets_file(
    "oauth_client.json",
    SCOPES
)

credentials = flow.run_local_server(port=0)

url = (
    f"https://serviceusage.googleapis.com/v1beta1/"
    f"projects/{PROJECT_NUMBER}/services/"
    f"generativelanguage.googleapis.com/consumerQuotaMetrics"
)

response = requests.get(
    url,
    headers={"Authorization": f"Bearer {credentials.token}"}
)

print("HTTP:", response.status_code)
print(response.text)
