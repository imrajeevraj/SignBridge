import argparse
import json
from .dataset import load_dataset, statistics

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description='Validate exact extractor provenance, shapes, classes, hashes and signer/duplicate splits.')
    parser.add_argument('manifest'); args=parser.parse_args()
    manifest, clips, checksum=load_dataset(args.manifest)
    print(json.dumps({'dataset_sha256':checksum, 'statistics':statistics(manifest,clips)},indent=2))
