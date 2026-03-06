import os

CDN_HOST = "img-pc.so-net.tw"
PLATFORM = "Android"
MANIFEST_URL = "https://{host}/dl/Resources/{version}/Jpn/AssetBundles/{platform}/manifest/{manifest_name}"
POOL_URL = "http://{host}/dl/pool/AssetBundles/{hash_prefix}/{hash}"
MASTERDATA_MANIFEST = "masterdata2_assetmanifest"
MASTER_BUNDLE_NAME = "masterdata_master"
VERSION_FILE = os.path.join(os.path.dirname(__file__), "version.json")
OUTPUT_DB = os.path.join(os.path.dirname(__file__), "..", "..", "app", "assets", "redive_tw.db")
OUTPUT_DB_BR = OUTPUT_DB + ".br"
USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 10; Pixel 3 XL Build/QQ3A.200805.001)"
UNITY_VERSION = "2021.3.20f1"
GITHUB_FALLBACK_URL = "https://raw.githubusercontent.com/Expugn/priconne-database/master/master_tw.db"
