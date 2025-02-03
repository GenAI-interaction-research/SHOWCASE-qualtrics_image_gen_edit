import os
import csv
import cloudinary
import cloudinary.api
from dotenv import load_dotenv
from datetime import datetime
from collections import defaultdict, Counter

# Load environment variables
load_dotenv()

# Configure Cloudinary
cloudinary.config(
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key = os.getenv('CLOUDINARY_API_KEY'),
    api_secret = os.getenv('CLOUDINARY_API_SECRET')
)

def parse_timestamp(filename):
    try:
        # Take the last 15 characters and format them
        timestamp_str = filename[-15:]  # Format: YYYYMMDD_HHMMSS
        timestamp = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
        return timestamp.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return ''  # Return empty string if parsing fails

def get_all_cloudinary_filenames():
    all_filenames = []
    next_cursor = None

    while True:
        try:
            result = cloudinary.api.resources(
                type="upload",
                max_results=500,
                next_cursor=next_cursor
            )
            
            filenames = [resource['public_id'].split('/')[-1] for resource in result['resources']]
            all_filenames.extend(filenames)
            
            if 'next_cursor' in result:
                next_cursor = result['next_cursor']
            else:
                break
                
        except Exception as e:
            print(f"Error: {str(e)}")
            break
    
    return all_filenames

def process_files():
    # Get all files
    filenames = get_all_cloudinary_filenames()
    
    # Count occurrences of each session ID
    session_counts = Counter(filename.split('_')[0] for filename in filenames)
    
    # Prepare data with counts and timestamps
    sorted_data = []
    for filename in filenames:
        session_id = filename.split('_')[0]
        # Check if this is the first occurrence of this session_id in our output
        is_first = not any(row['session_id'] == session_id for row in sorted_data)
        
        sorted_data.append({
            'session_id': session_id,
            'filename': filename,
            'timestamp': parse_timestamp(filename),
            '# of inputs': session_counts[session_id] if is_first else ''
        })
    
    # Sort by session_id and timestamp
    sorted_data.sort(key=lambda x: (x['session_id'], x['timestamp'] or ''))
    return sorted_data

if __name__ == "__main__":
    # Process files
    sorted_data = process_files()
    
    # Create timestamp for the CSV file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_filename = f'cloudinary_files_{timestamp}.csv'
    
    # Save to CSV
    with open(csv_filename, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['session_id', 'filename', 'timestamp', '# of inputs']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        
        writer.writeheader()
        for row in sorted_data:
            writer.writerow(row)
    
    print(f"Total files processed: {len(sorted_data)}")
    print(f"Total unique sessions: {len(set(row['session_id'] for row in sorted_data))}")
    print(f"Files have been saved to: {os.path.abspath(csv_filename)}")