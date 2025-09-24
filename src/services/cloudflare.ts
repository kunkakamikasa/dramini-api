import axios from 'axios'
import FormData from 'form-data'

export class CloudflareService {
  private accountId: string
  private apiToken: string
  private apiUrl: string

  constructor() {
    this.accountId = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || ''
    this.apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN || ''
    this.apiUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1`
  }

  async uploadImage(fileBuffer: Buffer, filename: string): Promise<string> {
    try {
      console.log('Cloudflare upload starting...')
      console.log('Account ID:', this.accountId)
      console.log('API Token:', this.apiToken ? 'Set' : 'Not set')
      console.log('API URL:', this.apiUrl)
      
      const formData = new FormData()
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: 'image/jpeg'
      })

      console.log('Sending request to Cloudflare...')
      const response = await axios.post(this.apiUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${this.apiToken}`,
        },
      })

      console.log('Cloudflare response:', response.data)

      if (response.data.success) {
        const imageUrl = response.data.result.variants[0]
        console.log('Upload successful, image URL:', imageUrl)
        return imageUrl
      } else {
        console.error('Cloudflare upload failed:', response.data)
        throw new Error('Upload failed')
      }
    } catch (error) {
      console.error('Cloudflare upload error:', error)
      if (error instanceof Error && 'response' in error) {
        const axiosError = error as any
        console.error('Response status:', axiosError.response?.status)
        console.error('Response data:', axiosError.response?.data)
      }
      throw error
    }
  }
}
